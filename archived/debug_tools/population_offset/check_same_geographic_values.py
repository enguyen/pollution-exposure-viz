#!/usr/bin/env python3
"""
Check if the same geographic coordinates have the same population values
across the three TIFFs, accounting for their different origins.
"""

import rasterio
import numpy as np

def get_population_at_geographic_point(filename, target_lat, target_lon):
    """Get population value at a specific geographic coordinate."""
    with rasterio.open(filename) as src:
        # Convert geographic coordinates to pixel coordinates
        row, col = src.index(target_lon, target_lat)
        
        # Check if coordinates are within bounds
        if (0 <= row < src.height and 0 <= col < src.width):
            data = src.read(1)
            value = data[row, col]
            return float(value) if np.isfinite(value) else None
        else:
            return None

def main():
    """Compare population values at the same geographic coordinates."""
    
    files = [
        ("1566584", "1566584-pop-v3.tiff"),
        ("1566601", "1566601-pop-v3.tiff"), 
        ("38089178", "38089178-pop-v3.tiff")
    ]
    
    print("POPULATION VALUE COMPARISON AT SAME GEOGRAPHIC COORDINATES")
    print("=" * 65)
    
    # Test points: use the center of the 1566601 TIFF as reference, 
    # plus some offset points that should be in overlap zones
    reference_center_lat = 31.905000
    reference_center_lon = 118.611667
    
    test_points = [
        (reference_center_lat, reference_center_lon, "1566601 center"),
        (reference_center_lat + 0.1, reference_center_lon, "100m north of 1566601 center"),
        (reference_center_lat - 0.1, reference_center_lon, "100m south of 1566601 center"),
        (reference_center_lat, reference_center_lon + 0.1, "100m east of 1566601 center"),
        (reference_center_lat, reference_center_lon - 0.1, "100m west of 1566601 center"),
    ]
    
    for lat, lon, description in test_points:
        print(f"\n📍 Testing point: {description}")
        print(f"   Geographic coordinates: {lat:.6f}°N, {lon:.6f}°E")
        print(f"   Population values:")
        
        values = {}
        for asset_id, filename in files:
            value = get_population_at_geographic_point(filename, lat, lon)
            values[asset_id] = value
            if value is not None:
                print(f"     {asset_id}: {value:.1f} people")
            else:
                print(f"     {asset_id}: OUT OF BOUNDS")
        
        # Check if all non-null values are the same
        non_null_values = [v for v in values.values() if v is not None]
        if len(non_null_values) > 1:
            all_same = all(abs(v - non_null_values[0]) < 0.01 for v in non_null_values)
            if all_same:
                print(f"   ✅ All TIFFs have SAME population value at this location")
            else:
                print(f"   ❌ TIFFs have DIFFERENT population values at same geographic point!")
                print(f"      This indicates coordinate system corruption!")

    print(f"\n" + "=" * 65)
    print("CONCLUSION:")
    print("If population values are SAME at same geographic coordinates,")
    print("then the issue is in frontend coordinate mapping, not source data.")
    print("If population values are DIFFERENT at same geographic coordinates,")
    print("then there's a fundamental coordinate system bug in the TIFFs.")

if __name__ == "__main__":
    main()