#!/usr/bin/env python3
"""
Export raw person-exposure data alongside existing overlays for client-side rendering.
"""

import rasterio
import numpy as np
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
import time


def export_raw_exposure_data(asset_info):
    """Export raw person-exposure, concentration, and population data for an asset."""
    country = asset_info['country']
    asset_id = asset_info['asset_id']
    
    # File paths
    exposure_path = f'processed/{country}_{asset_id}_person_exposure.tiff'
    conc_path = f'input_geotiffs/{country}/{asset_id}-v2.tiff'
    pop_path = f'input_geotiffs/{country}/{asset_id}-pop-v2.tiff'
    output_path = f'raw_data/{country}_{asset_id}_raw.json'
    
    # Check if files exist
    if not all(os.path.exists(p) for p in [exposure_path, conc_path, pop_path]):
        return None, f"Missing files for {country}_{asset_id}"
    
    # Check if raw data already exists
    if os.path.exists(output_path):
        return None, f"Raw data already exists for {country}_{asset_id}"
    
    try:
        # Read data
        with rasterio.open(exposure_path) as src:
            exposure_data = src.read(1)
            transform = src.transform
            bounds = src.bounds
            
        with rasterio.open(conc_path) as conc_src:
            conc_data = conc_src.read(1)
        
        with rasterio.open(pop_path) as pop_src:
            pop_data = pop_src.read(1)
        
        # Downsample to same resolution as overlays (200x200 max)
        height, width = exposure_data.shape
        scale_factor = max(1, min(height, width) // 200)
        if scale_factor > 1:
            exposure_data = exposure_data[::scale_factor, ::scale_factor]
            conc_data = conc_data[::scale_factor, ::scale_factor]
            pop_data = pop_data[::scale_factor, ::scale_factor]
            height, width = exposure_data.shape
        
        # Skip if no exposure data
        max_exposure = np.max(exposure_data)
        if max_exposure <= 0:
            return None, f"No exposure data for {country}_{asset_id}"
        
        # Convert to lists for JSON serialization
        raw_data = {
            'asset_id': asset_id,
            'country': country,
            'dimensions': {
                'width': int(width),
                'height': int(height)
            },
            'bounds': {
                'north': float(bounds.top),
                'south': float(bounds.bottom),
                'east': float(bounds.right),
                'west': float(bounds.left)
            },
            'transform': [float(x) for x in transform],
            'data': {
                'person_exposure': exposure_data.astype(np.float32).tolist(),
                'concentration': conc_data.astype(np.float32).tolist(),
                'population': pop_data.astype(np.float32).tolist()
            },
            'stats': {
                'max_exposure': float(max_exposure),
                'min_exposure': float(np.min(exposure_data[exposure_data > 0])) if np.any(exposure_data > 0) else 0.0,
                'max_concentration': float(np.max(conc_data)),
                'max_population': float(np.max(pop_data))
            }
        }
        
        # Save JSON
        with open(output_path, 'w') as f:
            json.dump(raw_data, f, separators=(',', ':'))  # Compact format
        
        # Calculate file size
        file_size = os.path.getsize(output_path) / 1024  # KB
        
        return raw_data, f"Exported {country}_{asset_id} ({file_size:.1f}KB, {width}x{height})"
        
    except Exception as e:
        return None, f"Error processing {country}_{asset_id}: {str(e)}"


def main():
    """Export raw data for all assets."""
    
    # Create output directory
    os.makedirs('raw_data', exist_ok=True)
    
    # Load assets data
    with open('assets.json', 'r') as f:
        assets_data = json.load(f)
    
    assets = assets_data['assets']
    print(f"Exporting raw data for {len(assets)} assets...")
    
    # Process in parallel
    results = []
    errors = []
    
    start_time = time.time()
    
    with ThreadPoolExecutor(max_workers=4) as executor:
        # Submit all tasks
        future_to_asset = {
            executor.submit(export_raw_exposure_data, asset): asset 
            for asset in assets
        }
        
        # Process results
        for i, future in enumerate(as_completed(future_to_asset)):
            asset = future_to_asset[future]
            raw_data, message = future.result()
            
            if raw_data:
                # Add raw data reference to asset
                asset['raw_data_file'] = f"{asset['country']}_{asset['asset_id']}_raw.json"
                results.append(asset)
                print(f"[{i+1}/{len(assets)}] ✓ {message}")
            else:
                errors.append(message)
                results.append(asset)  # Keep asset without raw data
                print(f"[{i+1}/{len(assets)}] ✗ {message}")
    
    # Update assets.json with raw data references
    assets_data['assets'] = results
    assets_data['metadata']['raw_data_exported'] = True
    assets_data['metadata']['canvas_rendering_enabled'] = True
    
    with open('assets.json', 'w') as f:
        json.dump(assets_data, f, indent=2)
    
    elapsed = time.time() - start_time
    
    # Calculate total data size
    total_size = 0
    for asset in results:
        if 'raw_data_file' in asset:
            file_path = f"raw_data/{asset['raw_data_file']}"
            if os.path.exists(file_path):
                total_size += os.path.getsize(file_path)
    
    total_size_mb = total_size / (1024 * 1024)
    
    # Summary
    print(f"\n{'='*60}")
    print(f"RAW DATA EXPORT COMPLETE")
    print(f"{'='*60}")
    print(f"Total assets: {len(assets)}")
    print(f"Raw data exported: {len(results) - len(errors)}")
    print(f"Errors/skipped: {len(errors)}")
    print(f"Processing time: {elapsed:.1f} seconds")
    print(f"Total raw data size: {total_size_mb:.1f} MB")
    print(f"Average per asset: {total_size_mb/(len(results) - len(errors)):.1f} MB")
    print(f"Updated assets.json with raw data references")
    
    if errors and len(errors) < 20:  # Show errors if not too many
        print(f"\nErrors:")
        for error in errors:
            print(f"  {error}")


if __name__ == '__main__':
    main()