#!/usr/bin/env python3
"""
Verify that overlay bounds provide accurate centers for frontend alignment.
This tests whether the mathematical center of bounds matches the center of actual data.
"""

import json
import numpy as np
from pathlib import Path

def verify_frontend_alignment(asset_file):
    """Verify that bounds center matches actual data center for frontend alignment."""
    
    with open(asset_file) as f:
        data = json.load(f)
    
    # Extract data
    concentration = np.array(data['data']['concentration'])
    bounds = data['bounds']
    dimensions = data['dimensions']
    pixel_size = data['pixel_size']
    
    print(f"\n🎯 VERIFYING FRONTEND ALIGNMENT: {asset_file.name}")
    print(f"Pipeline version: {data['processing']['pipeline_version']}")
    print(f"Bounds: N={bounds['north']:.6f}, S={bounds['south']:.6f}, E={bounds['east']:.6f}, W={bounds['west']:.6f}")
    print(f"Dimensions: {dimensions['width']}×{dimensions['height']}")
    
    # Find actual data extent (non-zero concentration pixels)
    nonzero_rows, nonzero_cols = np.where(concentration > 1e-6)
    
    if len(nonzero_rows) == 0:
        print("❌ No non-zero concentration data found")
        return False
    
    # Calculate actual data bounds in the overlay coordinate system
    min_row, max_row = np.min(nonzero_rows), np.max(nonzero_rows)
    min_col, max_col = np.min(nonzero_cols), np.max(nonzero_cols)
    
    # Calculate center of actual data in pixel coordinates
    data_center_row = (min_row + max_row) / 2.0
    data_center_col = (min_col + max_col) / 2.0
    
    # Calculate center from stored bounds
    bounds_center_lat = (bounds['north'] + bounds['south']) / 2.0
    bounds_center_lon = (bounds['west'] + bounds['east']) / 2.0
    
    # Convert data center from pixel coordinates to geographic coordinates
    # In the overlay coordinate system: 
    # - Row 0 corresponds to north edge of bounds
    # - Col 0 corresponds to west edge of bounds
    data_center_lat = bounds['north'] - data_center_row * pixel_size['y']
    data_center_lon = bounds['west'] + data_center_col * pixel_size['x']
    
    print(f"Data extent: rows {min_row}-{max_row}, cols {min_col}-{max_col}")
    print(f"Data center (geographic): {data_center_lat:.6f}°, {data_center_lon:.6f}°")
    print(f"Bounds center (geographic): {bounds_center_lat:.6f}°, {bounds_center_lon:.6f}°")
    
    # Calculate offset between data center and bounds center
    lat_offset = abs(data_center_lat - bounds_center_lat)
    lon_offset = abs(data_center_lon - bounds_center_lon)
    
    # Define acceptable tolerance (1 pixel)
    tolerance_lat = pixel_size['y']
    tolerance_lon = pixel_size['x']
    
    center_accurate = (lat_offset < tolerance_lat and lon_offset < tolerance_lon)
    
    if center_accurate:
        print("✅ Centers align accurately - frontend reticle should be correctly positioned")
        return True
    else:
        print("❌ Centers do NOT align - this will cause frontend alignment issues:")
        print(f"  Latitude offset: {lat_offset:.6f}° (tolerance: {tolerance_lat:.6f}°)")
        print(f"  Longitude offset: {lon_offset:.6f}° (tolerance: {tolerance_lon:.6f}°)")
        
        # Suggest the magnitude of visual offset
        offset_pixels_lat = lat_offset / pixel_size['y']
        offset_pixels_lon = lon_offset / pixel_size['x']
        print(f"  Visual offset: ~{offset_pixels_lat:.1f} pixels lat, ~{offset_pixels_lon:.1f} pixels lon")
        return False

def main():
    """Test frontend alignment for the problematic assets."""
    
    print("🎯 FRONTEND ALIGNMENT VERIFICATION")
    print("=" * 60)
    print("Testing whether bounds centers match actual data centers...")
    
    # Test the assets mentioned by the frontend engineer
    test_assets = [
        "CHN_1566584_data.json",  # Reticle northwest of marker
        "CHN_38089178_data.json", # Reticle southwest of marker  
        "CHN_1566601_data.json"  # Reticle southeast of marker
    ]
    
    overlays_dir = Path("overlays")
    aligned_count = 0
    
    for asset_name in test_assets:
        asset_file = overlays_dir / asset_name
        if asset_file.exists():
            is_aligned = verify_frontend_alignment(asset_file)
            if is_aligned:
                aligned_count += 1
        else:
            print(f"\n❌ File not found: {asset_file}")
    
    print(f"\n📊 SUMMARY")
    print("=" * 60)
    print(f"Properly aligned: {aligned_count}/{len(test_assets)} assets")
    
    if aligned_count == len(test_assets):
        print("✅ All assets properly aligned - frontend alignment issues should be resolved")
        print("💡 The reticle positioning problems should now be fixed")
    else:
        print("❌ Some assets still have alignment issues")
        print("💡 May need additional bounds calculation refinements")

if __name__ == "__main__":
    main()