#!/usr/bin/env python3
"""
Phase 0: Prototype unified TIFF-to-JSON pipeline
Test the streamlined approach on sample assets and compare with current pipeline.
"""

import rasterio
import numpy as np
import json
import math
from pathlib import Path
from typing import Dict, Tuple, List

def round_to_significant_digits(num: float, sig_digits: int = 3) -> float:
    """Round number to specified significant digits."""
    if num == 0:
        return 0.0
    
    sign = -1 if num < 0 else 1
    num = abs(num)
    
    power = sig_digits - int(math.floor(math.log10(num))) - 1
    rounded = round(num, power)
    return sign * rounded

def trim_zero_edges(data: np.ndarray, threshold: float = 1e-6) -> Tuple[np.ndarray, Tuple[int, int, int, int]]:
    """
    Trim zero-padding edges from raster data while preserving all non-zero content.
    
    Args:
        data: 2D numpy array 
        threshold: Values below this are considered "zero"
        
    Returns:
        Tuple of (trimmed_data, (top_trim, bottom_trim, left_trim, right_trim))
    """
    # Find bounding box of non-zero data
    nonzero_rows, nonzero_cols = np.where(data > threshold)
    
    if len(nonzero_rows) == 0:
        # All zeros, return minimal array
        return data[:1, :1], (0, data.shape[0]-1, 0, data.shape[1]-1)
    
    # Find bounding box
    min_row, max_row = np.min(nonzero_rows), np.max(nonzero_rows)
    min_col, max_col = np.min(nonzero_cols), np.max(nonzero_cols)
    
    # Add small buffer to ensure we don't cut off edge effects
    buffer = 2
    min_row = max(0, min_row - buffer)
    max_row = min(data.shape[0] - 1, max_row + buffer)
    min_col = max(0, min_col - buffer) 
    max_col = min(data.shape[1] - 1, max_col + buffer)
    
    # Trim the data
    trimmed = data[min_row:max_row+1, min_col:max_col+1]
    
    # Calculate how much was trimmed
    top_trim = min_row
    bottom_trim = data.shape[0] - 1 - max_row
    left_trim = min_col
    right_trim = data.shape[1] - 1 - max_col
    
    return trimmed, (top_trim, bottom_trim, left_trim, right_trim)

def calculate_exposure_buckets(conc_data: np.ndarray, pop_data: np.ndarray) -> Dict:
    """
    Calculate population exposure buckets using predefined risk categories.
    Based on UI legend risk levels: Low, Elevated, Significant, High, Very High, Extreme.
    
    Args:
        conc_data: Concentration array (μg/m³)
        pop_data: Population array (people)
        
    Returns:
        Dictionary with bucket information
    """
    # Only consider areas with concentration > 0
    mask_exposed = conc_data > 0
    exposed_conc = conc_data[mask_exposed]
    exposed_pop = pop_data[mask_exposed]
    
    if len(exposed_conc) == 0:
        return {
            "buckets": {},
            "total_exposed_population": 0.0,
            "bucket_ranges_ugm3": [],
            "description": "No population exposed to PM2.5"
        }
    
    # Define predefined risk buckets from UI legend
    risk_buckets = [
        (0, 12, "Low Additional Risk (0-12)", "#FFF45C"),
        (12, 35, "Elevated Additional Risk (12-35)", "#FFA500"),
        (35, 55, "Significant Additional Risk (35-55)", "#FF6347"),
        (55, 150, "High Additional Risk (55-150)", "#FF0000"),
        (150, 250, "Very High Additional Risk (150-250)", "#8B0000"),
        (250, float('inf'), "Extreme Additional Risk (250+)", "#800080")
    ]
    
    bucket_populations = {}
    bucket_ranges = []
    bucket_metadata = {}
    
    # Calculate population for each predefined bucket
    for min_conc, max_conc, label, color in risk_buckets:
        if max_conc == float('inf'):
            # Handle final bucket (250+)
            mask = exposed_conc >= min_conc
            bucket_key = f"{min_conc}+"
        else:
            # Handle finite buckets
            mask = (exposed_conc >= min_conc) & (exposed_conc < max_conc)
            bucket_key = f"{min_conc}-{max_conc}"
        
        population_count = float(np.sum(exposed_pop[mask]))
        
        # Only include buckets with population > 0
        if population_count > 0:
            bucket_populations[bucket_key] = population_count
            bucket_ranges.append((min_conc, max_conc if max_conc != float('inf') else "inf"))
            bucket_metadata[bucket_key] = {
                "label": label,
                "color": color,
                "range_ugm3": (min_conc, max_conc if max_conc != float('inf') else "inf")
            }
    
    # Calculate total exposed population
    total_population = sum(bucket_populations.values())
    
    return {
        "buckets": bucket_populations,
        "total_exposed_population": total_population,
        "bucket_ranges_ugm3": bucket_ranges,
        "bucket_metadata": bucket_metadata,
        "description": "Population count by PM2.5 concentration risk categories (WHO-based health risk levels)"
    }

def process_asset_unified(asset_id: str, country: str, 
                         input_dir: str = "input_geotiffs",
                         output_dir: str = "prototype_overlays",
                         preserve_full_resolution: bool = True,
                         precision_digits: int = 3) -> Dict:
    """
    Process a single asset with the unified pipeline.
    
    Args:
        asset_id: Asset identifier
        country: Country code
        input_dir: Input directory containing country subdirectories
        output_dir: Output directory for JSON overlays
        preserve_full_resolution: If True, keep full resolution with edge trimming
        precision_digits: Number of significant digits to preserve
    
    Returns:
        Asset metadata dictionary
    """
    
    # File paths
    conc_file = Path(input_dir) / country / f"{asset_id}-v2.tiff"
    pop_file = Path(input_dir) / country / f"{asset_id}-pop-v3.tiff"
    output_file = Path(output_dir) / f"{country}_{asset_id}_unified.json"
    
    print(f"Processing {country}_{asset_id}...")
    
    # Verify files exist
    if not conc_file.exists():
        raise FileNotFoundError(f"Concentration file not found: {conc_file}")
    if not pop_file.exists():
        raise FileNotFoundError(f"Population file not found: {pop_file}")
    
    # Read concentration data
    with rasterio.open(conc_file) as src:
        conc_data = src.read(1)
        transform = src.transform
        bounds = src.bounds
        crs = src.crs
        original_shape = conc_data.shape
    
    # Read population data
    with rasterio.open(pop_file) as src:
        pop_data = src.read(1)
        pop_bounds = src.bounds
        pop_shape = pop_data.shape
    
    # Verify spatial alignment
    if not (np.allclose([bounds.left, bounds.bottom, bounds.right, bounds.top],
                       [pop_bounds.left, pop_bounds.bottom, pop_bounds.right, pop_bounds.top], 
                       rtol=1e-6) and conc_data.shape == pop_data.shape):
        raise ValueError(f"Concentration and population rasters are not aligned for {country}_{asset_id}")
    
    print(f"  Original size: {original_shape}")
    
    # Clean data (remove NaN, negative values)
    conc_clean = np.where(np.isfinite(conc_data) & (conc_data >= 0), conc_data, 0)
    pop_clean = np.where(np.isfinite(pop_data) & (pop_data >= 0), pop_data, 0)
    
    # Calculate person-exposure
    person_exposure = conc_clean * pop_clean
    
    # Initialize variables that will be used later
    trim_info = (0, 0, 0, 0)  # Default: no trimming
    
    if preserve_full_resolution:
        # Trim zero edges to remove padding while keeping full data resolution
        conc_trimmed, trim_info = trim_zero_edges(conc_clean)
        pop_trimmed, _ = trim_zero_edges(pop_clean)  # Should have same trim
        exposure_trimmed, _ = trim_zero_edges(person_exposure)
        
        final_shape = conc_trimmed.shape
        top_trim, bottom_trim, left_trim, right_trim = trim_info
        print(f"  Trimmed edges: top={top_trim}, bottom={bottom_trim}, left={left_trim}, right={right_trim}")
        print(f"  Final size: {final_shape} (from {original_shape})")
        
        # Use trimmed data
        final_conc = conc_trimmed
        final_pop = pop_trimmed
        final_exposure = exposure_trimmed
        scale_factor = 1  # No downsampling
        
        # Update transform for trimmed bounds
        # Adjust the top-left corner based on trimming
        pixel_size_x = abs(transform[0])
        pixel_size_y = abs(transform[4])
        
        # New top-left corner
        new_top_left_x = transform[2] + left_trim * pixel_size_x
        new_top_left_y = transform[5] - top_trim * pixel_size_y  # Y decreases going down
        
        # Update bounds based on actual trimmed data
        trimmed_bounds = bounds._replace(
            left=new_top_left_x,
            right=new_top_left_x + final_shape[1] * pixel_size_x,
            top=new_top_left_y,
            bottom=new_top_left_y - final_shape[0] * pixel_size_y
        )
        
    else:
        # Fallback: just use the full data (in case someone sets preserve_full_resolution=False)
        final_conc = conc_clean
        final_pop = pop_clean
        final_exposure = person_exposure
        final_shape = conc_clean.shape
        scale_factor = 1
        trimmed_bounds = bounds
        print(f"  Using full resolution: {final_shape}")
    
    # Apply precision rounding and convert to lists
    def round_array(arr):
        return [[round_to_significant_digits(float(val), precision_digits) 
                for val in row] for row in arr]
    
    conc_list = round_array(final_conc)
    pop_list = round_array(final_pop)
    
    # Calculate exposure buckets (10 μg/m³ intervals)
    exposure_buckets = calculate_exposure_buckets(conc_clean, pop_clean)
    
    # Calculate statistics on original full-resolution data
    stats = {
        "max_concentration": round_to_significant_digits(float(np.max(conc_clean)), precision_digits),
        "max_population": round_to_significant_digits(float(np.max(pop_clean)), precision_digits),
        "max_person_exposure": round_to_significant_digits(float(np.max(person_exposure)), precision_digits),
        "total_person_exposure": round_to_significant_digits(float(np.sum(person_exposure)), precision_digits),
        "non_zero_pixels": int(np.sum(person_exposure > 0))
    }
    
    # Calculate pixel size for the final data
    pixel_size_x = abs(transform[0]) * scale_factor  # degrees per pixel
    pixel_size_y = abs(transform[4]) * scale_factor
    
    # Create output data structure
    overlay_data = {
        "asset_id": asset_id,
        "country": country,
        "bounds": {
            "north": round(float(trimmed_bounds.top), 6),
            "south": round(float(trimmed_bounds.bottom), 6), 
            "east": round(float(trimmed_bounds.right), 6),
            "west": round(float(trimmed_bounds.left), 6)
        },
        "dimensions": {
            "width": final_shape[1],
            "height": final_shape[0]
        },
        "pixel_size": {
            "x": round(pixel_size_x, 8),
            "y": round(pixel_size_y, 8)
        },
        "original_dimensions": {
            "width": original_shape[1], 
            "height": original_shape[0]
        },
        "scale_factor": scale_factor,
        "data": {
            "concentration": conc_list,
            "population": pop_list
        },
        "exposure_analysis": exposure_buckets,
        "stats": stats,
        "processing": {
            "precision_digits": precision_digits,
            "preserve_full_resolution": preserve_full_resolution,
            "crs": str(crs),
            "pipeline_version": "unified_v3.0_risk_buckets",
            "edge_trimming": {
                "top": int(trim_info[0]),
                "bottom": int(trim_info[1]), 
                "left": int(trim_info[2]),
                "right": int(trim_info[3])
            } if preserve_full_resolution else None
        }
    }
    
    # Create output directory
    Path(output_dir).mkdir(exist_ok=True)
    
    # Output filename - clean for production use
    output_file = Path(output_dir) / f"{country}_{asset_id}_data.json"
    
    # Save JSON with compact formatting
    with open(output_file, 'w') as f:
        json.dump(overlay_data, f, separators=(',', ':'))
    
    # Calculate file size
    file_size_kb = output_file.stat().st_size / 1024
    
    print(f"  Generated: {output_file} ({file_size_kb:.1f}KB)")
    print(f"  Stats: max_exposure={stats['max_person_exposure']}, total={stats['total_person_exposure']}")
    
    return overlay_data

def test_sample_assets():
    """Test the unified pipeline on a few sample assets."""
    
    # Sample assets to test (choose ones we know exist)
    test_assets = [
        ("1566957", "KOR"),  # The asset we've been analyzing
        ("1566447", "BRA"),  # Another one from our previous work
    ]
    
    # Add a third asset if we can find one
    assets_file = Path("assets.json")
    if assets_file.exists():
        with open(assets_file) as f:
            assets_data = json.load(f)
        
        # Find one more asset from a different country
        for asset in assets_data['assets']:
            if (asset['country'] not in ['KOR', 'BRA'] and 
                len(test_assets) < 3):
                test_assets.append((asset['asset_id'], asset['country']))
                break
    
    print(f"Testing unified pipeline on {len(test_assets)} sample assets:")
    print("=" * 60)
    
    results = []
    
    for asset_id, country in test_assets:
        try:
            result = process_asset_unified(asset_id, country)
            results.append(result)
            print()
        except Exception as e:
            print(f"  ERROR: {e}")
            print()
    
    print("=" * 60)
    print(f"Successfully processed {len(results)}/{len(test_assets)} assets")
    
    # Summary statistics
    if results:
        total_size = 0
        for r in results:
            file_path = Path("prototype_overlays") / f"{r['country']}_{r['asset_id']}_unified.json"
            if file_path.exists():
                total_size += file_path.stat().st_size
        
        if total_size > 0:
            avg_size = total_size / len(results) / 1024
            print(f"Total size: {total_size/1024:.1f}KB, Average: {avg_size:.1f}KB per file")
    
    return results

if __name__ == "__main__":
    test_sample_results = test_sample_assets()