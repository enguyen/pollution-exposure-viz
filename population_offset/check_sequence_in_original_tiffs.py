#!/usr/bin/env python3
"""
Check if the population sequence [16.0, 5.42, 5.36] appears at the same 
geographic coordinates in the original population TIFFs.
"""

import rasterio
import numpy as np

def find_sequence_in_tiff(filename, target_sequence):
    """Find a horizontal sequence of population values in a TIFF and return their geographic coordinates."""
    
    with rasterio.open(filename) as src:
        data = src.read(1)
        transform = src.transform
        height, width = data.shape
        
        print(f"\n🔍 Searching {filename}:")
        print(f"   Dimensions: {width}×{height}")
        print(f"   Transform: {transform}")
        print(f"   Bounds: N={src.bounds.top:.6f}, S={src.bounds.bottom:.6f}, E={src.bounds.right:.6f}, W={src.bounds.left:.6f}")
        
        # Search for the sequence horizontally
        found_locations = []
        for row in range(height):
            for col in range(width - len(target_sequence) + 1):
                # Check if sequence matches
                sequence_match = True
                for i, target_val in enumerate(target_sequence):
                    actual_val = data[row, col + i]
                    if not (np.isfinite(actual_val) and abs(actual_val - target_val) < 0.001):
                        sequence_match = False
                        break
                
                if sequence_match:
                    # Found the sequence! Calculate geographic coordinates for each value
                    geo_coords = []
                    for i in range(len(target_sequence)):
                        # Convert pixel coordinates to geographic coordinates
                        lon, lat = rasterio.transform.xy(transform, row, col + i)
                        geo_coords.append((lat, lon))
                        print(f"     [{i}] pixel({col + i},{row}) = {data[row, col + i]} -> geo({lat:.6f}, {lon:.6f})")
                    
                    found_locations.append({
                        'pixel_start': (col, row),
                        'geo_coords': geo_coords,
                        'values': [data[row, col + i] for i in range(len(target_sequence))]
                    })
        
        if len(found_locations) == 0:
            print("   ❌ SEQUENCE NOT FOUND")
        elif len(found_locations) == 1:
            print("   ✅ SEQUENCE FOUND EXACTLY ONCE")
        else:
            print(f"   ⚠️  SEQUENCE FOUND {len(found_locations)} TIMES")
        
        return found_locations

def main():
    """Compare the sequence location across original population TIFFs."""
    
    print("🧪 TESTING ORIGINAL POPULATION TIFFS FOR SEQUENCE [16.0, 5.42, 5.36]")
    print("=" * 80)
    
    target_sequence = [16.0, 5.42, 5.36]
    tiff_files = [
        "1566584-pop-v3.tiff",
        "1566601-pop-v3.tiff", 
        "38089178-pop-v3.tiff"
    ]
    
    all_locations = {}
    
    for filename in tiff_files:
        asset_id = filename.split('-')[0]
        try:
            locations = find_sequence_in_tiff(filename, target_sequence)
            all_locations[asset_id] = locations
        except Exception as e:
            print(f"   ❌ Error reading {filename}: {e}")
            all_locations[asset_id] = []
    
    # Compare geographic coordinates across TIFFs
    print(f"\n📊 GEOGRAPHIC COORDINATE COMPARISON:")
    print("=" * 80)
    
    if all(len(locs) == 1 for locs in all_locations.values() if locs):
        print("All TIFFs contain the sequence exactly once. Comparing coordinates:")
        
        for i in range(len(target_sequence)):
            print(f"\nValue {i} ({target_sequence[i]}) geographic positions:")
            
            positions = []
            for asset_id, locations in all_locations.items():
                if locations:
                    lat, lon = locations[0]['geo_coords'][i]
                    print(f"   {asset_id}: geo({lat:.6f}, {lon:.6f})")
                    positions.append((lat, lon))
            
            if len(positions) >= 2:
                lats = [pos[0] for pos in positions]
                lons = [pos[1] for pos in positions]
                lat_variance = max(lats) - min(lats)
                lon_variance = max(lons) - min(lons)
                
                print(f"   Geographic variance: {lat_variance:.6f}° lat, {lon_variance:.6f}° lon")
                
                if lat_variance < 0.000001 and lon_variance < 0.000001:
                    print(f"   ✅ SAME geographic coordinates in original TIFFs - issue is in overlay processing!")
                else:
                    print(f"   ❌ DIFFERENT geographic coordinates in original TIFFs - issue is in source data!")
    else:
        print("Sequence not found uniquely in all TIFFs - cannot compare coordinates")
    
    print(f"\n" + "=" * 80)
    print("🔍 CONCLUSION:")
    print("If coordinates are SAME in original TIFFs: Bug is in overlay processing pipeline")  
    print("If coordinates are DIFFERENT in original TIFFs: Bug is in TIFF creation/georeferencing")

if __name__ == "__main__":
    main()