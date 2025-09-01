#!/usr/bin/env python3
"""
Generate a single PNG overlay for testing the raster display functionality.
"""

import rasterio
import numpy as np
from PIL import Image
import json
import os


def create_simple_overlay(exposure_tiff_path: str, output_png_path: str, 
                         concentration_path: str, population_path: str) -> dict:
    """Create a simple PNG overlay from exposure data."""
    
    print(f"Processing: {exposure_tiff_path}")
    
    with rasterio.open(exposure_tiff_path) as src:
        exposure_data = src.read(1)
        transform = src.transform
        bounds = src.bounds
        
    # Read concentration and population data
    with rasterio.open(concentration_path) as conc_src:
        conc_data = conc_src.read(1)
    
    with rasterio.open(population_path) as pop_src:
        pop_data = pop_src.read(1)
        
    print(f"Original size: {exposure_data.shape}")
    
    # Downsample to reasonable size
    scale_factor = max(1, min(exposure_data.shape) // 200)
    if scale_factor > 1:
        exposure_data = exposure_data[::scale_factor, ::scale_factor]
        conc_data = conc_data[::scale_factor, ::scale_factor]
        pop_data = pop_data[::scale_factor, ::scale_factor]
        print(f"Downsampled by {scale_factor}x to: {exposure_data.shape}")
    
    height, width = exposure_data.shape
    
    # Enhanced colormap: person-exposure -> heat map colors
    max_exposure = np.max(exposure_data)
    print(f"Max exposure: {max_exposure}")
    
    # Create RGBA array
    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    
    # Better coloring: heat map based on log scale of exposure
    mask = exposure_data > 0
    if np.any(mask):
        # Use log scale for better visualization
        log_exposure = np.log10(exposure_data[mask] + 1)
        log_max = np.log10(max_exposure + 1)
        normalized = np.clip(log_exposure / log_max, 0, 1)
        
        # Heat map colors: blue -> green -> yellow -> orange -> red
        for idx, norm_val in enumerate(normalized):
            i, j = np.where(mask)
            pixel_i, pixel_j = i[idx], j[idx]
            
            if norm_val < 0.2:
                # Blue to cyan
                rgba[pixel_i, pixel_j] = [0, int(norm_val * 5 * 255), 255, 150]
            elif norm_val < 0.4:
                # Cyan to green
                progress = (norm_val - 0.2) * 5
                rgba[pixel_i, pixel_j] = [0, 255, int(255 * (1 - progress)), 180]
            elif norm_val < 0.6:
                # Green to yellow
                progress = (norm_val - 0.4) * 5
                rgba[pixel_i, pixel_j] = [int(255 * progress), 255, 0, 200]
            elif norm_val < 0.8:
                # Yellow to orange
                progress = (norm_val - 0.6) * 5
                rgba[pixel_i, pixel_j] = [255, int(255 * (1 - progress * 0.5)), 0, 220]
            else:
                # Orange to red
                progress = (norm_val - 0.8) * 5
                rgba[pixel_i, pixel_j] = [255, int(128 * (1 - progress)), 0, 240]
    
    # Save PNG
    img = Image.fromarray(rgba, 'RGBA')
    img.save(output_png_path)
    
    print(f"Saved: {output_png_path}")
    
    # Create pixel data for hover tooltips (sample every nth pixel)
    sample_rate = max(1, min(height, width) // 50)  # ~50x50 sample grid
    pixel_data = []
    
    for i in range(0, height, sample_rate):
        for j in range(0, width, sample_rate):
            exposure_val = exposure_data[i, j]
            if exposure_val > 0:  # Only include pixels with exposure
                # Convert pixel coordinates to geographic coordinates
                lon, lat = rasterio.transform.xy(transform, i * scale_factor, j * scale_factor)
                
                pixel_data.append({
                    'lat': float(lat),
                    'lon': float(lon),
                    'exposure': float(exposure_val),
                    'concentration': float(conc_data[i, j]),
                    'population': float(pop_data[i, j])
                })
    
    print(f"Generated {len(pixel_data)} pixel data points for tooltips")
    
    return {
        'png_file': os.path.basename(output_png_path),
        'bounds': {
            'north': float(bounds.top),
            'south': float(bounds.bottom),
            'east': float(bounds.right),
            'west': float(bounds.left)
        },
        'max_exposure': float(max_exposure),
        'pixel_data': pixel_data
    }


def main():
    """Test overlay generation on the BRA sample."""
    
    # Test with the sample BRA asset
    exposure_path = 'processed/BRA_1566447_person_exposure.tiff'
    output_path = 'overlays/BRA_1566447_overlay.png'
    conc_path = 'input_geotiffs/BRA/1566447-v2.tiff'
    pop_path = 'input_geotiffs/BRA/1566447-pop-v2.tiff'
    
    # Create output directory
    os.makedirs('overlays', exist_ok=True)
    
    if all(os.path.exists(p) for p in [exposure_path, conc_path, pop_path]):
        overlay_info = create_simple_overlay(exposure_path, output_path, conc_path, pop_path)
        print("Overlay metadata:", overlay_info)
        
        # Add to assets.json for testing
        try:
            with open('assets.json', 'r') as f:
                assets_data = json.load(f)
            
            # Find BRA_1566447 asset and add overlay info
            for asset in assets_data['assets']:
                if asset['asset_id'] == '1566447' and asset['country'] == 'BRA':
                    asset['overlay'] = overlay_info
                    print(f"Added overlay info to assets.json with {len(overlay_info['pixel_data'])} pixel data points")
                    break
            
            # Save updated assets.json
            with open('assets.json', 'w') as f:
                json.dump(assets_data, f, indent=2)
                
        except Exception as e:
            print(f"Error updating assets.json: {e}")
    
    else:
        missing_files = [p for p in [exposure_path, conc_path, pop_path] if not os.path.exists(p)]
        print(f"Missing files: {missing_files}")


if __name__ == '__main__':
    main()