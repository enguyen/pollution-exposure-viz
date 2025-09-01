#!/usr/bin/env python3
"""
Generate web-compatible PNG overlays from person-exposure GeoTIFF files
for interactive map display with pixel-level hover data.
"""

import rasterio
import numpy as np
from PIL import Image
import json
import os
import colorsys
from typing import Dict, Tuple, Optional


def create_exposure_colormap(max_value: float) -> callable:
    """
    Create a colormap function for person-exposure values.
    Uses a heat map style: transparent -> yellow -> orange -> red -> purple
    """
    def colormap(value: float) -> Tuple[int, int, int, int]:
        if value <= 0:
            return (0, 0, 0, 0)  # Transparent for no exposure
        
        # Normalize value to 0-1 range (log scale for better visualization)
        norm_value = min(1.0, np.log10(value + 1) / np.log10(max_value + 1))
        
        if norm_value < 0.25:
            # Transparent to yellow
            alpha = int(norm_value * 4 * 180)  # 0-180 alpha
            return (255, 255, 0, alpha)
        elif norm_value < 0.5:
            # Yellow to orange
            progress = (norm_value - 0.25) * 4
            return (255, int(255 - progress * 100), 0, 200)
        elif norm_value < 0.75:
            # Orange to red
            progress = (norm_value - 0.5) * 4
            return (255, int(155 - progress * 155), 0, 220)
        else:
            # Red to purple
            progress = (norm_value - 0.75) * 4
            return (int(255 - progress * 100), 0, int(progress * 200), 240)
    
    return colormap


def generate_png_overlay(geotiff_path: str, output_path: str, 
                        concentration_path: str, population_path: str) -> Dict:
    """
    Generate a PNG overlay from person-exposure GeoTIFF with transparency.
    Also extracts pixel-level data for hover tooltips.
    
    Returns metadata including bounds and pixel data structure.
    """
    
    # Read the person-exposure raster
    with rasterio.open(geotiff_path) as src:
        exposure_data = src.read(1)
        transform = src.transform
        bounds = src.bounds
        crs = src.crs
    
    # Read concentration and population data for hover info
    with rasterio.open(concentration_path) as conc_src:
        conc_data = conc_src.read(1)
    
    with rasterio.open(population_path) as pop_src:
        pop_data = pop_src.read(1)
    
    # Get max exposure for colormap scaling
    max_exposure = np.max(exposure_data[exposure_data > 0])
    if max_exposure == 0:
        max_exposure = 1  # Avoid division by zero
    
    # Create colormap
    colormap = create_exposure_colormap(max_exposure)
    
    # Convert to RGBA image (downsample for performance)
    height, width = exposure_data.shape
    
    # Downsample large rasters for web display
    if height > 300 or width > 300:
        scale_factor = max(height // 300, width // 300)
        exposure_data = exposure_data[::scale_factor, ::scale_factor]
        conc_data = conc_data[::scale_factor, ::scale_factor]
        pop_data = pop_data[::scale_factor, ::scale_factor]
        height, width = exposure_data.shape
    
    rgba_array = np.zeros((height, width, 4), dtype=np.uint8)
    
    # Vectorized colormap application for better performance
    valid_mask = exposure_data > 0
    if np.any(valid_mask):
        # Normalize values
        norm_values = np.log10(exposure_data[valid_mask] + 1) / np.log10(max_exposure + 1)
        norm_values = np.clip(norm_values, 0, 1)
        
        # Apply colormap vectorized
        for i, j in zip(*np.where(valid_mask)):
            rgba_array[i, j] = colormap(exposure_data[i, j])
    
    # Create PIL image and save
    img = Image.fromarray(rgba_array, 'RGBA')
    img.save(output_path)
    
    # Create pixel data structure for hover tooltips
    # Sample every nth pixel to reduce data size
    sample_rate = max(1, min(width, height) // 100)  # ~100x100 sample grid
    
    pixel_data = []
    for i in range(0, height, sample_rate):
        for j in range(0, width, sample_rate):
            exposure_val = exposure_data[i, j]
            if exposure_val > 0:  # Only include pixels with exposure
                # Convert pixel coordinates to geographic coordinates
                lon, lat = rasterio.transform.xy(transform, i, j)
                
                pixel_data.append({
                    'lat': float(lat),
                    'lon': float(lon),
                    'exposure': float(exposure_val),
                    'concentration': float(conc_data[i, j]),
                    'population': float(pop_data[i, j])
                })
    
    # Return metadata
    return {
        'png_file': os.path.basename(output_path),
        'bounds': {
            'north': float(bounds.top),
            'south': float(bounds.bottom),
            'east': float(bounds.right),
            'west': float(bounds.left)
        },
        'crs': str(crs),
        'max_exposure': float(max_exposure),
        'pixel_count': len(pixel_data),
        'dimensions': {'width': width, 'height': height},
        'pixel_data': pixel_data
    }


def batch_generate_overlays(assets_json_path: str = 'assets.json',
                          processed_dir: str = 'processed',
                          input_dir: str = 'input_geotiffs',
                          output_dir: str = 'overlays') -> None:
    """
    Generate PNG overlays for all assets and update assets.json with overlay metadata.
    """
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Load assets data
    with open(assets_json_path, 'r') as f:
        assets_data = json.load(f)
    
    print(f"Generating PNG overlays for {len(assets_data['assets'])} assets...")
    
    updated_assets = []
    
    for asset in assets_data['assets']:
        asset_id = asset['asset_id']
        country = asset['country']
        
        # File paths
        exposure_tiff = os.path.join(processed_dir, f"{country}_{asset_id}_person_exposure.tiff")
        concentration_tiff = os.path.join(input_dir, country, f"{asset_id}-v2.tiff")
        population_tiff = os.path.join(input_dir, country, f"{asset_id}-pop-v2.tiff")
        
        output_png = os.path.join(output_dir, f"{country}_{asset_id}_overlay.png")
        
        if not all(os.path.exists(f) for f in [exposure_tiff, concentration_tiff, population_tiff]):
            print(f"Skipping {country}_{asset_id}: Missing input files")
            updated_assets.append(asset)
            continue
        
        try:
            # Generate overlay
            overlay_metadata = generate_png_overlay(
                exposure_tiff, output_png, concentration_tiff, population_tiff
            )
            
            # Add overlay info to asset
            asset['overlay'] = overlay_metadata
            updated_assets.append(asset)
            
            print(f"Generated overlay for {country}_{asset_id}")
            
        except Exception as e:
            print(f"Error generating overlay for {country}_{asset_id}: {e}")
            updated_assets.append(asset)
    
    # Update assets.json
    assets_data['assets'] = updated_assets
    assets_data['metadata']['overlay_generated'] = True
    
    with open(assets_json_path, 'w') as f:
        json.dump(assets_data, f, indent=2)
    
    print(f"Generated overlays saved to {output_dir}/")
    print(f"Updated {assets_json_path} with overlay metadata")


def main():
    """Generate overlays for all assets."""
    batch_generate_overlays()


if __name__ == '__main__':
    main()