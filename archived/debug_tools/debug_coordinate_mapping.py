#!/usr/bin/env python3
"""
Debug script to understand the coordinate mapping between TIFF and JSON data.
"""

import json
import rasterio
import numpy as np

def debug_coordinate_mapping():
    """Debug coordinate mapping for asset 1566584."""
    
    print("🔍 DEBUGGING COORDINATE MAPPING FOR ASSET 1566584")
    print("=" * 60)
    
    # Load JSON data
    with open('prototype_overlays/CHN_1566584_data.json', 'r') as f:
        json_data = json.load(f)
    
    # Load TIFF data
    with rasterio.open('input_geotiffs/CHN/1566584-pop-v3.tiff') as src:
        tiff_data = src.read(1)
        tiff_transform = src.transform
        tiff_bounds = src.bounds
    
    # Find the target sequence in both
    target_sequence = [16.0, 5.42, 5.36]
    
    print(f"\n📍 TIFF INFORMATION:")
    print(f"   Bounds: N={tiff_bounds.top:.6f}, S={tiff_bounds.bottom:.6f}, E={tiff_bounds.right:.6f}, W={tiff_bounds.left:.6f}")
    print(f"   Shape: {tiff_data.shape}")
    print(f"   Transform: {tiff_transform}")
    
    # Find sequence in TIFF
    tiff_location = None
    for row in range(tiff_data.shape[0]):
        for col in range(tiff_data.shape[1] - len(target_sequence) + 1):
            if all(abs(tiff_data[row, col + i] - target_sequence[i]) < 0.01 for i in range(len(target_sequence))):
                tiff_location = (row, col)
                break
        if tiff_location:
            break
    
    if tiff_location:
        tiff_row, tiff_col = tiff_location
        print(f"\n✅ TIFF: Sequence found at pixel ({tiff_col}, {tiff_row})")
        
        # Calculate TIFF geographic coordinates
        tiff_coords = []
        for i in range(len(target_sequence)):
            lon, lat = rasterio.transform.xy(tiff_transform, tiff_row, tiff_col + i)
            tiff_coords.append((lat, lon))
            print(f"   [{i}] TIFF pixel({tiff_col + i},{tiff_row}) = {tiff_data[tiff_row, tiff_col + i]:.2f} -> ({lat:.6f}°N, {lon:.6f}°E)")
    
    print(f"\n📍 JSON INFORMATION:")
    print(f"   Bounds: N={json_data['bounds']['north']:.6f}, S={json_data['bounds']['south']:.6f}, E={json_data['bounds']['east']:.6f}, W={json_data['bounds']['west']:.6f}")
    print(f"   Dimensions: {json_data['dimensions']['height']}×{json_data['dimensions']['width']}")
    print(f"   Original dimensions: {json_data['original_dimensions']['height']}×{json_data['original_dimensions']['width']}")
    
    edge_trim = json_data['processing']['edge_trimming']
    print(f"   Edge trimming: top={edge_trim['top']}, bottom={edge_trim['bottom']}, left={edge_trim['left']}, right={edge_trim['right']}")
    
    # Find sequence in JSON
    json_pop_data = json_data['data']['population']
    json_location = None
    for row in range(len(json_pop_data)):
        for col in range(len(json_pop_data[row]) - len(target_sequence) + 1):
            if all(abs(json_pop_data[row][col + i] - target_sequence[i]) < 0.01 for i in range(len(target_sequence))):
                json_location = (row, col)
                break
        if json_location:
            break
    
    if json_location:
        json_row, json_col = json_location
        print(f"\n✅ JSON: Sequence found at data position ({json_col}, {json_row})")
        
        # Calculate JSON geographic coordinates using the test's method
        bounds = json_data['bounds']
        width = json_data['dimensions']['width']
        height = json_data['dimensions']['height']
        
        pixel_size_x = (bounds['east'] - bounds['west']) / width
        pixel_size_y = (bounds['north'] - bounds['south']) / height
        
        print(f"   Pixel sizes: X={pixel_size_x:.8f}°/pixel, Y={pixel_size_y:.8f}°/pixel")
        
        json_coords = []
        for i in range(len(target_sequence)):
            geo_x = bounds['west'] + (json_col + i + 0.5) * pixel_size_x
            geo_y = bounds['north'] - (json_row + 0.5) * pixel_size_y
            json_coords.append((geo_y, geo_x))
            print(f"   [{i}] JSON data[{json_row}][{json_col + i}] = {json_pop_data[json_row][json_col + i]:.2f} -> ({geo_y:.6f}°N, {geo_x:.6f}°E)")
    
    print(f"\n🔍 COORDINATE COMPARISON:")
    if tiff_location and json_location:
        for i in range(len(target_sequence)):
            tiff_lat, tiff_lon = tiff_coords[i]
            json_lat, json_lon = json_coords[i]
            lat_diff = abs(tiff_lat - json_lat)
            lon_diff = abs(tiff_lon - json_lon)
            print(f"   [{i}] Difference: ({lat_diff:.6f}° lat, {lon_diff:.6f}° lon)")
        
        # Calculate what the JSON coordinates SHOULD be
        print(f"\n🧮 EXPECTED JSON COORDINATE CALCULATION:")
        print("   If trimmed JSON data[0][0] should represent the same geographic location")
        print("   as original TIFF data[top_trim][left_trim], then:")
        
        # The trimmed data should start at the geographic location corresponding to
        # the original pixel (top_trim, left_trim)
        expected_json_row_0_geo = tiff_bounds.top - edge_trim['top'] * (tiff_bounds.top - tiff_bounds.bottom) / tiff_data.shape[0]
        expected_json_col_0_geo = tiff_bounds.left + edge_trim['left'] * (tiff_bounds.right - tiff_bounds.left) / tiff_data.shape[1]
        
        print(f"   JSON bounds should have:")
        print(f"     North: {expected_json_row_0_geo:.6f}° (actual: {bounds['north']:.6f}°)")
        print(f"     West:  {expected_json_col_0_geo:.6f}° (actual: {bounds['west']:.6f}°)")

if __name__ == "__main__":
    debug_coordinate_mapping()