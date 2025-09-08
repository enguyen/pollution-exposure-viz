#!/usr/bin/env python3
"""
Unit test to verify that population values are correctly translated from 
original TIFFs to JSON overlays with sub-meter coordinate accuracy.
"""

import json
import rasterio
import numpy as np
from pathlib import Path

def find_sequence_in_tiff(tiff_path, target_sequence):
    """Find a specific sequence in a TIFF and return its geographic coordinates."""
    with rasterio.open(tiff_path) as src:
        data = src.read(1)
        transform = src.transform
        height, width = data.shape
        
        # Search for horizontal sequence
        for row in range(height):
            for col in range(width - len(target_sequence) + 1):
                # Check if sequence matches
                sequence_match = True
                for i, target_val in enumerate(target_sequence):
                    actual_val = data[row, col + i]
                    if not (np.isfinite(actual_val) and abs(actual_val - target_val) < 0.01):
                        sequence_match = False
                        break
                
                if sequence_match:
                    # Calculate geographic coordinates for each value in sequence
                    geo_coords = []
                    for i in range(len(target_sequence)):
                        lon, lat = rasterio.transform.xy(transform, row, col + i)
                        geo_coords.append((lat, lon))
                    
                    return {
                        'pixel_coords': [(col + i, row) for i in range(len(target_sequence))],
                        'geo_coords': geo_coords,
                        'values': [data[row, col + i] for i in range(len(target_sequence))]
                    }
    return None

def find_sequence_in_overlay_json(json_path, target_sequence):
    """Find a specific sequence in overlay JSON and return its geographic coordinates."""
    with open(json_path, 'r') as f:
        data = json.load(f)
    
    population_data = data['data']['population']
    bounds = data['bounds']
    dimensions = data['dimensions']
    # Simplified pipeline uses direct 1:1 mapping, no edge trimming
    dimensions = data['dimensions']
    
    height = dimensions['height']
    width = dimensions['width']
    
    # Search for horizontal sequence in JSON data
    for row in range(height):
        for col in range(width - len(target_sequence) + 1):
            # Check if sequence matches
            sequence_match = True
            for i, target_val in enumerate(target_sequence):
                actual_val = population_data[row][col + i]
                if abs(actual_val - target_val) < 0.01:
                    continue
                else:
                    sequence_match = False
                    break
            
            if sequence_match:
                # Calculate geographic coordinates for each value in sequence
                # Method 1: Use the bounds from JSON (these should be corrected for edge trimming)
                pixel_size_x = (bounds['east'] - bounds['west']) / width
                pixel_size_y = (bounds['north'] - bounds['south']) / height
                
                geo_coords = []
                for i in range(len(target_sequence)):
                    # JSON data[row][col] maps to geographic coordinates
                    geo_x = bounds['west'] + (col + i + 0.5) * pixel_size_x
                    geo_y = bounds['north'] - (row + 0.5) * pixel_size_y
                    geo_coords.append((geo_y, geo_x))
                
                return {
                    'data_coords': [(col + i, row) for i in range(len(target_sequence))],
                    'geo_coords': geo_coords,
                    'values': [population_data[row][col + i] for i in range(len(target_sequence))],
                    'bounds': bounds,
                    'pipeline_info': data.get('processing', {})
                }
    return None

def test_coordinate_accuracy():
    """Test that TIFF and JSON coordinates match within sub-meter precision."""
    
    # Test sequence we know exists in all three assets
    target_sequence = [16.0, 5.42, 5.36]
    
    # Test assets
    test_assets = [
        {
            'asset_id': '1566584', 
            'tiff_path': 'input_geotiffs/CHN/1566584-pop-v3.tiff',
            'json_path': 'overlays/CHN_1566584_data.json'
        },
        {
            'asset_id': '1566601',
            'tiff_path': 'input_geotiffs/CHN/1566601-pop-v3.tiff', 
            'json_path': 'overlays/CHN_1566601_data.json'
        },
        {
            'asset_id': '38089178',
            'tiff_path': 'input_geotiffs/CHN/38089178-pop-v3.tiff',
            'json_path': 'overlays/CHN_38089178_data.json'
        }
    ]
    
    print("🧪 COORDINATE ACCURACY UNIT TEST")
    print("=" * 60)
    print(f"Target sequence: {target_sequence}")
    
    all_results = {}
    all_passed = True
    
    for asset in test_assets:
        asset_id = asset['asset_id']
        print(f"\n📍 Testing Asset {asset_id}:")
        
        # Check if files exist
        if not Path(asset['tiff_path']).exists():
            print(f"   ❌ TIFF not found: {asset['tiff_path']}")
            all_passed = False
            continue
            
        if not Path(asset['json_path']).exists():
            print(f"   ❌ JSON not found: {asset['json_path']}")
            all_passed = False
            continue
        
        # Find sequence in TIFF
        tiff_result = find_sequence_in_tiff(asset['tiff_path'], target_sequence)
        if not tiff_result:
            print(f"   ❌ Sequence not found in TIFF")
            all_passed = False
            continue
            
        # Find sequence in JSON
        json_result = find_sequence_in_overlay_json(asset['json_path'], target_sequence)
        if not json_result:
            print(f"   ❌ Sequence not found in JSON")
            all_passed = False
            continue
        
        print(f"   ✅ Sequence found in both TIFF and JSON")
        
        # Compare geographic coordinates
        max_lat_diff = 0
        max_lon_diff = 0
        
        for i in range(len(target_sequence)):
            tiff_lat, tiff_lon = tiff_result['geo_coords'][i]
            json_lat, json_lon = json_result['geo_coords'][i]
            
            lat_diff = abs(tiff_lat - json_lat)
            lon_diff = abs(tiff_lon - json_lon)
            
            max_lat_diff = max(max_lat_diff, lat_diff)
            max_lon_diff = max(max_lon_diff, lon_diff)
            
            print(f"     [{i}] TIFF: ({tiff_lat:.6f}, {tiff_lon:.6f})")
            print(f"     [{i}] JSON: ({json_lat:.6f}, {json_lon:.6f})")
            print(f"     [{i}] Diff: ({lat_diff:.8f}°, {lon_diff:.8f}°)")
        
        # Convert to meters (approximate)
        max_lat_meters = max_lat_diff * 111000  # 1 degree ≈ 111km
        max_lon_meters = max_lon_diff * 111000 * 0.85  # cos(32°) ≈ 0.85
        
        print(f"   📏 Max coordinate difference: {max_lat_diff:.8f}° lat, {max_lon_diff:.8f}° lon")
        print(f"   📏 Max distance difference: {max_lat_meters:.1f}m lat, {max_lon_meters:.1f}m lon")
        
        # Test for sub-meter accuracy (allow up to 1 meter difference)
        if max_lat_meters < 1.0 and max_lon_meters < 1.0:
            print(f"   ✅ PASS: Coordinates match within sub-meter precision")
        else:
            print(f"   ❌ FAIL: Coordinates differ by more than 1 meter")
            all_passed = False
        
        all_results[asset_id] = {
            'tiff_coords': tiff_result['geo_coords'],
            'json_coords': json_result['geo_coords'],
            'max_lat_diff': max_lat_diff,
            'max_lon_diff': max_lon_diff,
            'max_lat_meters': max_lat_meters,
            'max_lon_meters': max_lon_meters,
            'passed': max_lat_meters < 1.0 and max_lon_meters < 1.0
        }
    
    print(f"\n" + "=" * 60)
    print("🏁 TEST SUMMARY:")
    
    if all_passed:
        print("✅ ALL TESTS PASSED: Coordinate translation is accurate within sub-meter precision")
        return True
    else:
        print("❌ TESTS FAILED: Coordinate translation has errors > 1 meter")
        
        # Show which assets failed
        for asset_id, result in all_results.items():
            if not result['passed']:
                print(f"   {asset_id}: {result['max_lat_meters']:.1f}m lat, {result['max_lon_meters']:.1f}m lon error")
        
        return False

if __name__ == "__main__":
    success = test_coordinate_accuracy()
    exit(0 if success else 1)