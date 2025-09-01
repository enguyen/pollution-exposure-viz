#!/usr/bin/env python3
"""
GeoTIFF processor for PM2.5 concentration and population data pairs.
Extracts metadata and performs order-of-magnitude pixel counting.
"""

import rasterio
import numpy as np
import re
import os
from typing import Dict, Tuple, List
import json
import glob
from datetime import datetime


def extract_asset_info_from_filename(filename: str, country: str = None) -> Dict[str, str]:
    """Extract asset ID and country from filename pattern."""
    # New pattern: {asset_id}-[suffix]-v2.tiff (within country directories)
    if country:
        pattern = r'(\d+)(?:-(.+?))?-v2\.tiff'
        match = re.search(pattern, filename)
        if match:
            asset_id, suffix = match.groups()
            return {
                'asset_id': asset_id,
                'country': country,
                'suffix': suffix or 'concentration'
            }
    
    # Fallback: old pattern cmu_plumes_footprints_v2_BRA_1566447-[suffix]-v2.tiff
    pattern = r'cmu_plumes_footprints_v2_([A-Z]{3})_(\d+)(?:-(.+?))?-v2\.tiff'
    match = re.search(pattern, filename)
    
    if not match:
        raise ValueError(f"Filename doesn't match expected pattern: {filename}")
    
    country, asset_id, suffix = match.groups()
    return {
        'asset_id': asset_id,
        'country': country,
        'suffix': suffix or 'concentration'
    }


def count_pixels_by_order_of_magnitude(data: np.ndarray) -> Dict[str, int]:
    """Count pixels falling in each order of magnitude range."""
    # Remove any negative values and NaN
    valid_data = data[np.isfinite(data) & (data >= 0)]
    
    # Define order of magnitude ranges
    ranges = [
        ('0', 0, 0),           # exactly zero
        ('0.001-0.01', 0.001, 0.01),
        ('0.01-0.1', 0.01, 0.1),
        ('0.1-1', 0.1, 1),
        ('1-10', 1, 10),
        ('10-100', 10, 100),
        ('100-1000', 100, 1000),
        ('1000-10000', 1000, 10000),
        ('10000+', 10000, np.inf)
    ]
    
    counts = {}
    
    # Count exact zeros separately
    zero_count = np.sum(valid_data == 0)
    counts['0'] = int(zero_count)
    
    # Count non-zero values in ranges
    non_zero_data = valid_data[valid_data > 0]
    
    for range_name, min_val, max_val in ranges[1:]:
        if max_val == np.inf:
            count = np.sum(non_zero_data >= min_val)
        else:
            count = np.sum((non_zero_data >= min_val) & (non_zero_data < max_val))
        counts[range_name] = int(count)
    
    return counts


def get_asset_centerpoint(transform, shape: Tuple[int, int]) -> Tuple[float, float]:
    """Calculate the centerpoint of the raster (asset location)."""
    rows, cols = shape
    center_row = rows // 2
    center_col = cols // 2
    
    # Convert pixel coordinates to geographic coordinates
    lon, lat = rasterio.transform.xy(transform, center_row, center_col)
    return float(lon), float(lat)


def compute_person_exposure_raster(conc_data: np.ndarray, pop_data: np.ndarray) -> Tuple[np.ndarray, Dict]:
    """
    Compute person-exposure raster by multiplying concentration and population.
    
    Args:
        conc_data: PM2.5 concentration raster (μg/m³)
        pop_data: Population density raster (people/km²)
        
    Returns:
        Tuple of (person_exposure_raster, exposure_stats)
    """
    # Handle invalid values - set NaN or negative values to 0
    conc_clean = np.where(np.isfinite(conc_data) & (conc_data >= 0), conc_data, 0)
    pop_clean = np.where(np.isfinite(pop_data) & (pop_data >= 0), pop_data, 0)
    
    # Calculate person-exposure raster (concentration × population)
    person_exposure_raster = conc_clean * pop_clean
    
    # Calculate comprehensive statistics
    valid_exposure = person_exposure_raster[person_exposure_raster > 0]
    
    exposure_stats = {
        'total_person_exposure': float(np.sum(person_exposure_raster)),
        'mean_person_exposure': float(np.mean(person_exposure_raster)),
        'max_person_exposure': float(np.max(person_exposure_raster)),
        'min_person_exposure': float(np.min(person_exposure_raster)),
        'std_person_exposure': float(np.std(person_exposure_raster)),
        'non_zero_pixels': int(np.sum(person_exposure_raster > 0)),
        'non_zero_mean': float(np.mean(valid_exposure)) if len(valid_exposure) > 0 else 0.0
    }
    
    return person_exposure_raster, exposure_stats


def save_person_exposure_geotiff(person_exposure_raster: np.ndarray, 
                                  output_file: str, 
                                  transform, 
                                  crs, 
                                  nodata_value: float = -9999.0) -> None:
    """
    Save person-exposure raster as a GeoTIFF file.
    
    Args:
        person_exposure_raster: The computed person-exposure data
        output_file: Path to output GeoTIFF file
        transform: Rasterio transform from source file
        crs: Coordinate reference system from source file
        nodata_value: Value to use for NoData pixels
    """
    with rasterio.open(
        output_file,
        'w',
        driver='GTiff',
        height=person_exposure_raster.shape[0],
        width=person_exposure_raster.shape[1],
        count=1,
        dtype=person_exposure_raster.dtype,
        crs=crs,
        transform=transform,
        nodata=nodata_value
    ) as dst:
        dst.write(person_exposure_raster, 1)


SCRIPT_VERSION = "1.1.0"


def find_asset_pairs(input_dir: str = 'input_geotiffs') -> List[Tuple[str, str, str, str]]:
    """
    Find all concentration/population file pairs organized by country.
    
    Returns:
        List of (country, asset_id, conc_file_path, pop_file_path) tuples
    """
    pairs = []
    
    # Look for country directories
    country_dirs = [d for d in os.listdir(input_dir) 
                   if os.path.isdir(os.path.join(input_dir, d)) and len(d) == 3]
    
    for country in country_dirs:
        country_path = os.path.join(input_dir, country)
        
        # Find all asset IDs in this country
        files = os.listdir(country_path)
        asset_ids = set()
        
        for file in files:
            if file.endswith('-v2.tiff'):
                try:
                    info = extract_asset_info_from_filename(file, country)
                    asset_ids.add(info['asset_id'])
                except ValueError:
                    continue
        
        # For each asset, try to find concentration and population pairs
        for asset_id in asset_ids:
            conc_file = os.path.join(country_path, f"{asset_id}-v2.tiff")
            pop_file = os.path.join(country_path, f"{asset_id}-pop-v2.tiff")
            
            if os.path.exists(conc_file) and os.path.exists(pop_file):
                pairs.append((country, asset_id, conc_file, pop_file))
            else:
                print(f"Warning: Missing pair for {country}_{asset_id}")
    
    return pairs


def needs_processing(country: str, asset_id: str, existing_assets: List[Dict]) -> bool:
    """
    Check if an asset needs processing based on version and existence.
    
    Args:
        country: Country code
        asset_id: Asset identifier
        existing_assets: List of existing processed assets
        
    Returns:
        True if processing is needed, False otherwise
    """
    # Find existing asset
    existing_asset = None
    for asset in existing_assets:
        if asset['asset_id'] == asset_id and asset['country'] == country:
            existing_asset = asset
            break
    
    # If asset doesn't exist, needs processing
    if not existing_asset:
        return True
    
    # Check if script version is newer
    existing_version = existing_asset.get('script_version', '1.0.0')
    if existing_version < SCRIPT_VERSION:
        return True
    
    # Check if output files exist
    exposure_file = existing_asset.get('files', {}).get('person_exposure')
    if exposure_file:
        exposure_path = os.path.join('processed', exposure_file)
        if not os.path.exists(exposure_path):
            return True
    
    return False


def process_asset_pair(conc_file: str, pop_file: str, country: str = None, save_exposure_tiff: bool = True, output_dir: str = 'processed') -> Dict:
    """Process a pair of concentration and population GeoTIFF files."""
    
    # Extract asset info from filenames
    conc_info = extract_asset_info_from_filename(os.path.basename(conc_file), country)
    pop_info = extract_asset_info_from_filename(os.path.basename(pop_file), country)
    
    # Verify they're the same asset
    if conc_info['asset_id'] != pop_info['asset_id']:
        raise ValueError(f"Asset IDs don't match: {conc_info['asset_id']} vs {pop_info['asset_id']}")
    
    if conc_info['country'] != pop_info['country']:
        raise ValueError(f"Countries don't match: {conc_info['country']} vs {pop_info['country']}")
    
    # Process concentration data
    with rasterio.open(conc_file) as src:
        conc_data = src.read(1)
        conc_transform = src.transform
        conc_shape = src.shape
        conc_crs = src.crs
        conc_bounds = src.bounds
        
    # Process population data  
    with rasterio.open(pop_file) as src:
        pop_data = src.read(1)
        pop_transform = src.transform
        pop_shape = src.shape
        pop_crs = src.crs
        pop_bounds = src.bounds
    
    # Verify spatial alignment
    if not (conc_transform == pop_transform and conc_shape == pop_shape):
        raise ValueError("Concentration and population rasters are not spatially aligned")
    
    # Get asset centerpoint
    center_lon, center_lat = get_asset_centerpoint(conc_transform, conc_shape)
    
    # Compute person-exposure raster
    person_exposure_raster, exposure_stats = compute_person_exposure_raster(conc_data, pop_data)
    
    # Count pixels by order of magnitude for all datasets
    conc_counts = count_pixels_by_order_of_magnitude(conc_data)
    pop_counts = count_pixels_by_order_of_magnitude(pop_data)
    exposure_counts = count_pixels_by_order_of_magnitude(person_exposure_raster)
    
    # Save person-exposure raster as GeoTIFF if requested
    exposure_filename = None
    if save_exposure_tiff:
        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
        
        # Generate output filename
        exposure_filename = f"{conc_info['country']}_{conc_info['asset_id']}_person_exposure.tiff"
        output_path = os.path.join(output_dir, exposure_filename)
        
        # Save the GeoTIFF
        save_person_exposure_geotiff(person_exposure_raster, output_path, conc_transform, conc_crs)
    
    # Compile results
    result = {
        'asset_id': conc_info['asset_id'],
        'country': conc_info['country'],
        'center_lon': center_lon,
        'center_lat': center_lat,
        'total_pixels': int(conc_data.size),
        'crs': str(conc_crs),
        'bounds': {
            'left': float(conc_bounds.left),
            'bottom': float(conc_bounds.bottom), 
            'right': float(conc_bounds.right),
            'top': float(conc_bounds.top)
        },
        'concentration_pixel_counts': conc_counts,
        'population_pixel_counts': pop_counts,
        'person_exposure_pixel_counts': exposure_counts,
        'person_exposure_stats': exposure_stats,
        'script_version': SCRIPT_VERSION,
        'processed_date': datetime.utcnow().isoformat() + "Z",
        'files': {
            'concentration': os.path.basename(conc_file),
            'population': os.path.basename(pop_file),
            'person_exposure': exposure_filename
        }
    }
    
    return result


def calculate_exposure_distribution_stats(asset_results: List[Dict]) -> Dict:
    """Calculate summary statistics for max person-exposure distribution."""
    import numpy as np
    
    # Extract max person-exposure values
    max_exposures = []
    total_exposures = []
    
    for asset in asset_results:
        if 'person_exposure_stats' in asset:
            max_exp = asset['person_exposure_stats']['max_person_exposure']
            total_exp = asset['person_exposure_stats']['total_person_exposure']
            max_exposures.append(max_exp)
            total_exposures.append(total_exp)
    
    if not max_exposures:
        return {}
    
    max_exposures = np.array(max_exposures)
    total_exposures = np.array(total_exposures)
    
    # Remove zeros for geometric calculations
    non_zero_max = max_exposures[max_exposures > 0]
    non_zero_total = total_exposures[total_exposures > 0]
    
    # Calculate statistics
    stats = {
        "max_person_exposure_stats": {
            "count": len(max_exposures),
            "min": float(np.min(max_exposures)),
            "max": float(np.max(max_exposures)), 
            "mean": float(np.mean(max_exposures)),
            "median": float(np.median(max_exposures)),
            "std": float(np.std(max_exposures)),
            "geometric_mean": float(np.exp(np.mean(np.log(non_zero_max)))) if len(non_zero_max) > 0 else 0.0,
            "percentile_90": float(np.percentile(max_exposures, 90)),
            "percentile_95": float(np.percentile(max_exposures, 95)),
            "percentile_99": float(np.percentile(max_exposures, 99))
        },
        "total_person_exposure_stats": {
            "count": len(total_exposures),
            "min": float(np.min(total_exposures)),
            "max": float(np.max(total_exposures)),
            "mean": float(np.mean(total_exposures)),
            "median": float(np.median(total_exposures)),
            "std": float(np.std(total_exposures)),
            "geometric_mean": float(np.exp(np.mean(np.log(non_zero_total)))) if len(non_zero_total) > 0 else 0.0,
            "sum_all_assets": float(np.sum(total_exposures))
        }
    }
    
    return stats


def create_assets_json(asset_results: List[Dict]) -> Dict:
    """Create the complete assets.json structure."""
    # Extract unique countries
    countries = sorted(list(set(asset['country'] for asset in asset_results)))
    
    # Calculate exposure distribution statistics
    exposure_stats = calculate_exposure_distribution_stats(asset_results)
    
    metadata = {
        "processed_date": datetime.utcnow().isoformat() + "Z",
        "total_assets": len(asset_results),
        "countries": countries,
        "data_version": "v2",
        "script_version": SCRIPT_VERSION
    }
    
    # Add exposure statistics to metadata
    metadata.update(exposure_stats)
    
    return {
        "metadata": metadata,
        "assets": asset_results
    }


def load_existing_assets(assets_file: str = 'assets.json') -> List[Dict]:
    """Load existing assets from JSON file."""
    if not os.path.exists(assets_file):
        return []
    
    try:
        with open(assets_file, 'r') as f:
            data = json.load(f)
            return data.get('assets', [])
    except (json.JSONDecodeError, KeyError):
        print(f"Warning: Could not read existing {assets_file}, starting fresh")
        return []


def batch_process_assets(input_dir: str = 'input_geotiffs', 
                        output_dir: str = 'processed',
                        assets_file: str = 'assets.json') -> Dict:
    """
    Batch process all asset pairs with incremental updates.
    
    Args:
        input_dir: Directory containing country subdirectories with GeoTIFF files
        output_dir: Directory to save processed exposure rasters
        assets_file: Path to assets.json metadata file
        
    Returns:
        Complete assets JSON structure
    """
    # Load existing processed assets
    existing_assets = load_existing_assets(assets_file)
    print(f"Found {len(existing_assets)} existing assets")
    
    # Find all asset pairs
    pairs = find_asset_pairs(input_dir)
    print(f"Found {len(pairs)} asset pairs to potentially process")
    
    # Process only assets that need updating
    processed_assets = []
    skipped_count = 0
    processed_count = 0
    
    for country, asset_id, conc_file, pop_file in pairs:
        if needs_processing(country, asset_id, existing_assets):
            print(f"Processing {country}_{asset_id}...")
            try:
                result = process_asset_pair(conc_file, pop_file, country, True, output_dir)
                processed_assets.append(result)
                processed_count += 1
            except Exception as e:
                print(f"Error processing {country}_{asset_id}: {e}")
                continue
        else:
            # Keep existing asset
            for asset in existing_assets:
                if asset['asset_id'] == asset_id and asset['country'] == country:
                    processed_assets.append(asset)
                    break
            skipped_count += 1
    
    print(f"Processed: {processed_count}, Skipped: {skipped_count}, Total: {len(processed_assets)}")
    
    # Create final assets JSON
    return create_assets_json(processed_assets)


def main():
    """Batch process all asset pairs and create comprehensive assets.json."""
    import sys
    
    print(f"PM2.5 Exposure Processor v{SCRIPT_VERSION}")
    print("=" * 50)
    
    try:
        # Batch process all assets
        assets_json = batch_process_assets()
        
        # Write to file
        output_file = 'assets.json'
        with open(output_file, 'w') as f:
            json.dump(assets_json, f, indent=2)
            
        print(f"\nCreated {output_file}")
        print(f"Total assets: {assets_json['metadata']['total_assets']}")
        print(f"Countries: {', '.join(assets_json['metadata']['countries'])}")
        print(f"Script version: {assets_json['metadata']['script_version']}")
        
    except Exception as e:
        print(f"Error during batch processing: {e}")
        return 1
    
    return 0


if __name__ == '__main__':
    exit(main())