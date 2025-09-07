#!/usr/bin/env python3
"""
Verify that overlay bounds accurately match the actual data extent.
This script checks if the bounds calculation in the unified pipeline is working correctly.
"""

import json
import numpy as np
from pathlib import Path

def verify_asset_bounds(asset_file):
    """Verify that bounds match actual data extent for a specific asset."""
    
    with open(asset_file) as f:
        data = json.load(f)
    
    # Extract data
    concentration = np.array(data['data']['concentration'])
    population = np.array(data['data']['population'])
    bounds = data['bounds']
    dimensions = data['dimensions']
    pixel_size = data['pixel_size']
    
    print(f"\n🔍 VERIFYING {asset_file.name}")
    print(f"Bounds: N={bounds['north']:.6f}, S={bounds['south']:.6f}, E={bounds['east']:.6f}, W={bounds['west']:.6f}")
    print(f"Dimensions: {dimensions['width']}×{dimensions['height']}")
    print(f"Pixel size: {pixel_size['x']:.8f}°")
    
    # Find actual data extent
    # Look for non-zero values in concentration data
    nonzero_rows, nonzero_cols = np.where(concentration > 1e-6)
    
    if len(nonzero_rows) == 0:
        print("❌ No non-zero concentration data found")
        return False
    
    # Calculate actual data bounds
    min_row, max_row = np.min(nonzero_rows), np.max(nonzero_rows)
    min_col, max_col = np.min(nonzero_cols), np.max(nonzero_cols)
    
    print(f"Data extent: rows {min_row}-{max_row} ({max_row-min_row+1} rows), cols {min_col}-{max_col} ({max_col-min_col+1} cols)")
    
    # Calculate expected bounds from data extent
    # Note: In image coordinates, row 0 = north (top), increasing row = south (bottom)
    expected_north = bounds['north'] - min_row * pixel_size['y']
    expected_south = bounds['north'] - (max_row + 1) * pixel_size['y']
    expected_west = bounds['west'] + min_col * pixel_size['x']
    expected_east = bounds['west'] + (max_col + 1) * pixel_size['x']
    
    print(f"Expected bounds from data: N={expected_north:.6f}, S={expected_south:.6f}, E={expected_east:.6f}, W={expected_west:.6f}")
    
    # Check if bounds match data extent (allowing small tolerance)
    tolerance = pixel_size['x'] * 2  # Allow 2-pixel tolerance
    
    north_match = abs(bounds['north'] - expected_north) < tolerance
    south_match = abs(bounds['south'] - expected_south) < tolerance  
    east_match = abs(bounds['east'] - expected_east) < tolerance
    west_match = abs(bounds['west'] - expected_west) < tolerance
    
    bounds_accurate = north_match and south_match and east_match and west_match
    
    if bounds_accurate:
        print("✅ Bounds accurately match data extent")
    else:
        print("❌ Bounds DO NOT match data extent:")
        if not north_match:
            print(f"  North: {bounds['north']:.6f} vs expected {expected_north:.6f} (diff: {bounds['north'] - expected_north:.6f})")
        if not south_match:
            print(f"  South: {bounds['south']:.6f} vs expected {expected_south:.6f} (diff: {bounds['south'] - expected_south:.6f})")
        if not east_match:
            print(f"  East: {bounds['east']:.6f} vs expected {expected_east:.6f} (diff: {bounds['east'] - expected_east:.6f})")
        if not west_match:
            print(f"  West: {bounds['west']:.6f} vs expected {expected_west:.6f} (diff: {bounds['west'] - expected_west:.6f})")
    
    # Calculate mathematical center
    data_center_lat = (expected_north + expected_south) / 2
    data_center_lon = (expected_west + expected_east) / 2
    bounds_center_lat = (bounds['north'] + bounds['south']) / 2
    bounds_center_lon = (bounds['west'] + bounds['east']) / 2
    
    print(f"Data center: {data_center_lat:.6f}, {data_center_lon:.6f}")
    print(f"Bounds center: {bounds_center_lat:.6f}, {bounds_center_lon:.6f}")
    
    center_offset_lat = bounds_center_lat - data_center_lat
    center_offset_lon = bounds_center_lon - data_center_lon
    
    if abs(center_offset_lat) > tolerance or abs(center_offset_lon) > tolerance:
        print(f"❌ Center offset: {center_offset_lat:.6f}°, {center_offset_lon:.6f}° (may cause reticle misalignment)")
    else:
        print("✅ Center calculation accurate")
    
    return bounds_accurate

def main():
    """Test bounds accuracy for the problematic assets."""
    
    print("🔍 BOUNDS ACCURACY VERIFICATION")
    print("=" * 60)
    
    # Test the assets mentioned by the frontend engineer
    test_assets = [
        "CHN_1566584_data.json",  # Reticle northwest of marker
        "CHN_38089178_data.json", # Reticle southwest of marker  
        "CHN_1566601_data.json"  # Reticle southeast of marker
    ]
    
    overlays_dir = Path("overlays")
    accurate_count = 0
    
    for asset_name in test_assets:
        asset_file = overlays_dir / asset_name
        if asset_file.exists():
            is_accurate = verify_asset_bounds(asset_file)
            if is_accurate:
                accurate_count += 1
        else:
            print(f"\n❌ File not found: {asset_file}")
    
    print(f"\n📊 SUMMARY")
    print("=" * 60)
    print(f"Accurate bounds: {accurate_count}/{len(test_assets)} assets")
    
    if accurate_count == len(test_assets):
        print("✅ All bounds are accurate - the issue may be frontend-side")
        print("💡 Suggestion: Check frontend center calculation and coordinate systems")
    else:
        print("❌ Some bounds are inaccurate - data processing needs to be fixed")
        print("💡 Suggestion: Re-run unified pipeline for affected assets")

if __name__ == "__main__":
    main()