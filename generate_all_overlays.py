#!/usr/bin/env python3
"""
Generate PNG overlays for all assets with person-exposure data.
"""

import rasterio
import numpy as np
from PIL import Image
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
from pathlib import Path


def create_overlay_for_asset(asset_info):
    """Generate overlay for a single asset."""
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
    
    # Check if overlay already exists
    if os.path.exists(output_path):
        return None, f"Overlay already exists for {country}_{asset_id}"
    
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
        
        # Create RGBA array
        rgba = np.zeros((height, width, 4), dtype=np.uint8)
        
        # Apply colormap
        mask = exposure_data > 0
        if np.any(mask):
            # Log scale normalization
            log_exposure = np.log10(exposure_data[mask] + 1)
            log_max = np.log10(max_exposure + 1)
            normalized = np.clip(log_exposure / log_max, 0, 1)
            
            # Vectorized color assignment
            indices = np.where(mask)
            for idx, (i, j) in enumerate(zip(indices[0], indices[1])):
                norm_val = normalized[idx]
                
                if norm_val < 0.2:
                    # Blue to cyan
                    rgba[i, j] = [0, int(norm_val * 5 * 255), 255, 150]
                elif norm_val < 0.4:
                    # Cyan to green
                    progress = (norm_val - 0.2) * 5
                    rgba[i, j] = [0, 255, int(255 * (1 - progress)), 180]
                elif norm_val < 0.6:
                    # Green to yellow
                    progress = (norm_val - 0.4) * 5
                    rgba[i, j] = [int(255 * progress), 255, 0, 200]
                elif norm_val < 0.8:
                    # Yellow to orange
                    progress = (norm_val - 0.6) * 5
                    rgba[i, j] = [255, int(255 * (1 - progress * 0.5)), 0, 220]
                else:
                    # Orange to red
                    progress = (norm_val - 0.8) * 5
                    rgba[i, j] = [255, int(128 * (1 - progress)), 0, 240]
        
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
            'pixel_data': pixel_data
        }
        
        return overlay_info, f"Generated {country}_{asset_id}"
        
    except Exception as e:
        return None, f"Error processing {country}_{asset_id}: {str(e)}"


def main():
    """Generate overlays for all assets in parallel."""
    
    # Create output directory
    os.makedirs('overlays', exist_ok=True)
    
    # Load assets data
    with open('assets.json', 'r') as f:
        assets_data = json.load(f)
    
    assets = assets_data['assets']
    print(f"Processing {len(assets)} assets...")
    
    # Process in parallel
    results = []
    errors = []
    
    start_time = time.time()
    
    with ThreadPoolExecutor(max_workers=4) as executor:
        # Submit all tasks
        future_to_asset = {
            executor.submit(create_overlay_for_asset, asset): asset 
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
    
    # Update assets.json
    assets_data['assets'] = results
    assets_data['metadata']['overlay_generated'] = True
    assets_data['metadata']['overlay_count'] = len([a for a in results if 'overlay' in a])
    
    with open('assets.json', 'w') as f:
        json.dump(assets_data, f, indent=2)
    
    elapsed = time.time() - start_time
    
    # Summary
    print(f"\n{'='*60}")
    print(f"OVERLAY GENERATION COMPLETE")
    print(f"{'='*60}")
    print(f"Total assets: {len(assets)}")
    print(f"Overlays generated: {len(results) - len(errors)}")
    print(f"Errors/skipped: {len(errors)}")
    print(f"Processing time: {elapsed:.1f} seconds")
    print(f"Updated assets.json")
    
    if errors and len(errors) < 20:  # Show errors if not too many
        print(f"\nErrors:")
        for error in errors:
            print(f"  {error}")


if __name__ == '__main__':
    main()