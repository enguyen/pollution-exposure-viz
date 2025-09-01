#!/usr/bin/env python3
"""
Generate PNG overlays with uniform log-scale white-to-black colormap.
Uses global color scale from 0 (transparent white) to 30,000,000 (opaque black).
"""

import rasterio
import numpy as np
from PIL import Image
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
import math


# Global color scale parameters
GLOBAL_MIN_EXPOSURE = 0.0
GLOBAL_MAX_EXPOSURE = 30_000_000.0  # 30 million


def exposure_to_color(exposure_value: float) -> tuple:
    """
    Convert exposure value to RGBA color using global log scale.
    
    Args:
        exposure_value: Person-exposure value
        
    Returns:
        RGBA tuple (R, G, B, A) with values 0-255
    """
    if exposure_value <= 0:
        return (255, 255, 255, 0)  # Transparent white for zero
    
    # Log scale normalization
    log_min = math.log10(1)  # log10(1) = 0, so we start from 1 for log scale
    log_max = math.log10(GLOBAL_MAX_EXPOSURE)
    log_value = math.log10(max(1, exposure_value))
    
    # Normalize to 0-1 range
    normalized = min(1.0, (log_value - log_min) / (log_max - log_min))
    
    # White to black gradient
    # Alpha increases from 0 to 255 (transparent to opaque)
    # RGB decreases from 255 to 0 (white to black)
    alpha = int(normalized * 255)
    rgb_value = int(255 * (1 - normalized))
    
    return (rgb_value, rgb_value, rgb_value, alpha)


def create_uniform_overlay(asset_info):
    """Generate overlay with uniform color scale for a single asset."""
    country = asset_info['country']
    asset_id = asset_info['asset_id']
    
    # File paths
    exposure_path = f'processed/{country}_{asset_id}_person_exposure.tiff'
    conc_path = f'input_geotiffs/{country}/{asset_id}-v2.tiff'
    pop_path = f'input_geotiffs/{country}/{asset_id}-pop-v2.tiff'
    output_path = f'overlays/{country}_{asset_id}_overlay.png'
    
    # Check if files exist
    if not all(os.path.exists(p) for p in [exposure_path, conc_path, pop_path]):
        return None, f"Missing files for {country}_{asset_id}"
    
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
        
        # Downsample for web display
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
        
        # Create RGBA array using uniform color scale
        rgba = np.zeros((height, width, 4), dtype=np.uint8)
        
        # Apply uniform colormap to all pixels
        for i in range(height):
            for j in range(width):
                exposure_val = exposure_data[i, j]
                rgba[i, j] = exposure_to_color(exposure_val)
        
        # Save PNG
        img = Image.fromarray(rgba, 'RGBA')
        img.save(output_path)
        
        # Create pixel data for hover tooltips (sample grid)
        sample_rate = max(1, min(height, width) // 50)
        pixel_data = []
        
        for i in range(0, height, sample_rate):
            for j in range(0, width, sample_rate):
                exposure_val = exposure_data[i, j]
                if exposure_val > 0:
                    # Convert to geographic coordinates
                    lon, lat = rasterio.transform.xy(transform, i * scale_factor, j * scale_factor)
                    
                    pixel_data.append({
                        'lat': float(lat),
                        'lon': float(lon),
                        'exposure': float(exposure_val),
                        'concentration': float(conc_data[i, j]),
                        'population': float(pop_data[i, j])
                    })
        
        # Return overlay metadata
        overlay_info = {
            'png_file': f'{country}_{asset_id}_overlay.png',
            'bounds': {
                'north': float(bounds.top),
                'south': float(bounds.bottom),
                'east': float(bounds.right),
                'west': float(bounds.left)
            },
            'max_exposure': float(max_exposure),
            'global_max_exposure': GLOBAL_MAX_EXPOSURE,
            'color_scale': 'log_white_to_black',
            'pixel_data': pixel_data
        }
        
        return overlay_info, f"Generated {country}_{asset_id} (max: {max_exposure:.1f})"
        
    except Exception as e:
        return None, f"Error processing {country}_{asset_id}: {str(e)}"


def main():
    """Generate uniform overlays for all assets."""
    
    # Create output directory
    os.makedirs('overlays', exist_ok=True)
    
    # Load assets data
    with open('assets.json', 'r') as f:
        assets_data = json.load(f)
    
    assets = assets_data['assets']
    print(f"Generating uniform overlays for {len(assets)} assets...")
    print(f"Color scale: 0 (transparent white) → {GLOBAL_MAX_EXPOSURE:,} (opaque black)")
    
    # Process in parallel
    results = []
    errors = []
    
    start_time = time.time()
    
    with ThreadPoolExecutor(max_workers=4) as executor:
        # Submit all tasks
        future_to_asset = {
            executor.submit(create_uniform_overlay, asset): asset 
            for asset in assets
        }
        
        # Process results
        for i, future in enumerate(as_completed(future_to_asset)):
            asset = future_to_asset[future]
            overlay_info, message = future.result()
            
            if overlay_info:
                # Add overlay info to asset
                asset['overlay'] = overlay_info
                results.append(asset)
                print(f"[{i+1}/{len(assets)}] ✓ {message}")
            else:
                errors.append(message)
                results.append(asset)  # Keep asset without overlay
                print(f"[{i+1}/{len(assets)}] ✗ {message}")
    
    # Update assets.json with uniform color scale metadata
    assets_data['assets'] = results
    assets_data['metadata']['overlay_generated'] = True
    assets_data['metadata']['overlay_count'] = len([a for a in results if 'overlay' in a])
    assets_data['metadata']['color_scale'] = {
        'type': 'log_white_to_black',
        'min_exposure': GLOBAL_MIN_EXPOSURE,
        'max_exposure': GLOBAL_MAX_EXPOSURE,
        'description': 'Log scale from transparent white (0) to opaque black (30M+)'
    }
    
    with open('assets.json', 'w') as f:
        json.dump(assets_data, f, indent=2)
    
    elapsed = time.time() - start_time
    
    # Summary
    print(f"\n{'='*60}")
    print(f"UNIFORM OVERLAY GENERATION COMPLETE")
    print(f"{'='*60}")
    print(f"Total assets: {len(assets)}")
    print(f"Overlays generated: {len(results) - len(errors)}")
    print(f"Errors/skipped: {len(errors)}")
    print(f"Processing time: {elapsed:.1f} seconds")
    print(f"Color scale: {GLOBAL_MIN_EXPOSURE} → {GLOBAL_MAX_EXPOSURE:,} (log scale)")
    print(f"Updated assets.json with uniform color metadata")
    
    if errors and len(errors) < 20:  # Show errors if not too many
        print(f"\nErrors:")
        for error in errors:
            print(f"  {error}")


if __name__ == '__main__':
    main()