#!/usr/bin/env python3
"""
Check if asset center coordinates match the center of overlay bounds.
This could explain why asset markers align correctly but population circles don't.
"""

import json

def main():
    """Compare asset centers vs overlay bounds centers."""
    
    with open('/Users/ericnguyen/Documents/plumes/assets.json', 'r') as f:
        data = json.load(f)
    
    target_assets = ["1566584", "1566601", "38089178"]
    
    print("ASSET CENTER vs OVERLAY BOUNDS CENTER COMPARISON")
    print("=" * 60)
    
    for asset in data['assets']:
        if asset['asset_id'] in target_assets:
            asset_id = asset['asset_id']
            
            # Asset center (used for markers)
            asset_center_lat = asset['center_lat']
            asset_center_lon = asset['center_lon']
            
            # Overlay bounds center (used for canvas positioning)
            bounds = asset['overlay']['bounds']
            bounds_center_lat = (bounds['north'] + bounds['south']) / 2
            bounds_center_lon = (bounds['east'] + bounds['west']) / 2
            
            # Calculate offset
            lat_diff = asset_center_lat - bounds_center_lat
            lon_diff = asset_center_lon - bounds_center_lon
            
            print(f"\n📍 Asset {asset_id}:")
            print(f"   Asset center:  {asset_center_lat:.6f}°N, {asset_center_lon:.6f}°E")
            print(f"   Bounds center: {bounds_center_lat:.6f}°N, {bounds_center_lon:.6f}°E")
            print(f"   Difference:    {lat_diff:+.6f}° lat, {lon_diff:+.6f}° lon")
            
            # Convert to approximate distances
            lat_diff_km = lat_diff * 111.0  # 1 degree ≈ 111 km
            lon_diff_km = lon_diff * 111.0 * 0.85  # cos(32°) ≈ 0.85
            
            if abs(lat_diff) > 0.000001 or abs(lon_diff) > 0.000001:
                print(f"   Distance:      {lat_diff_km:+.1f} km N, {lon_diff_km:+.1f} km E")
                print(f"   🚨 MISMATCH DETECTED!")
            else:
                print(f"   ✅ Centers match perfectly")
    
    print(f"\n" + "=" * 60)
    print("HYPOTHESIS:")
    print("If asset centers and bounds centers don't match, this explains why:")
    print("- Asset markers (using center_lat/lon) align with base maps")
    print("- Population circles (using bounds) are offset from asset markers")

if __name__ == "__main__":
    main()