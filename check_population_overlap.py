#!/usr/bin/env python3
"""
Check if population values near CHN_1566601's center appear in the other two population TIFFs.
If they should overlap, we should find the same population patterns.
"""

import rasterio
import numpy as np
from collections import defaultdict

def analyze_center_population(tiff_path, asset_name, center_size=50):
    """Extract population values from the center region of a TIFF."""
    
    with rasterio.open(tiff_path) as src:
        data = src.read(1)
        bounds = src.bounds
        transform = src.transform
        
        # Clean the data
        data_clean = np.where(np.isfinite(data) & (data >= 0), data, 0)
        
        height, width = data_clean.shape
        center_row = height // 2
        center_col = width // 2
        
        # Extract center region
        half_size = center_size // 2
        center_data = data_clean[
            max(0, center_row - half_size):min(height, center_row + half_size),
            max(0, center_col - half_size):min(width, center_col + half_size)
        ]
        
        print(f"\n📊 ANALYZING CENTER REGION - {asset_name}:")
        print(f"  File: {tiff_path}")
        print(f"  Full TIFF bounds: N={bounds.top:.6f}, S={bounds.bottom:.6f}, E={bounds.right:.6f}, W={bounds.left:.6f}")
        print(f"  Full TIFF shape: {data_clean.shape}")
        print(f"  Center region: {center_data.shape} around pixel ({center_row}, {center_col})")
        
        # Calculate geographic bounds of center region
        # Convert pixel coordinates to geographic
        center_north = transform[5] + (center_row - half_size) * transform[4]  # transform[4] is negative
        center_south = transform[5] + (center_row + half_size) * transform[4]
        center_west = transform[2] + (center_col - half_size) * transform[0]
        center_east = transform[2] + (center_col + half_size) * transform[0]
        
        # Handle negative transform[4] (south is smaller value)
        if center_north < center_south:
            center_north, center_south = center_south, center_north
        
        print(f"  Center region bounds: N={center_north:.6f}, S={center_south:.6f}, E={center_east:.6f}, W={center_west:.6f}")
        
        # Get unique non-zero values with their frequencies
        center_nonzero = center_data[center_data > 0]
        
        if len(center_nonzero) == 0:
            print(f"  ❌ No non-zero population in center region!")
            return None
        
        # Round values to group similar ones
        rounded_values = np.round(center_nonzero, 1)
        unique_values, counts = np.unique(rounded_values, return_counts=True)
        
        # Get the most common values
        value_counts = list(zip(unique_values, counts))
        value_counts.sort(key=lambda x: x[1], reverse=True)
        
        print(f"  Non-zero pixels in center: {len(center_nonzero)}")
        print(f"  Top population values in center:")
        for i, (value, count) in enumerate(value_counts[:10]):
            print(f"    {i+1}. {value:.1f} people: {count} pixels")
        
        return {
            'asset_name': asset_name,
            'center_bounds': {
                'north': float(center_north),
                'south': float(center_south),
                'east': float(center_east),
                'west': float(center_west)
            },
            'center_pixel': (center_row, center_col),
            'top_values': value_counts[:20],  # Top 20 values
            'total_center_pixels': len(center_nonzero),
            'center_data_shape': center_data.shape
        }

def find_values_in_tiff(tiff_path, target_values, asset_name, tolerance=0.1):
    """Search for specific population values anywhere in a TIFF."""
    
    with rasterio.open(tiff_path) as src:
        data = src.read(1)
        transform = src.transform
        
        data_clean = np.where(np.isfinite(data) & (data >= 0), data, 0)
        
        print(f"\n🔍 SEARCHING {asset_name} for target values:")
        matches = {}
        
        for target_value in target_values:
            # Find pixels with this value (within tolerance)
            mask = np.abs(data_clean - target_value) <= tolerance
            matching_pixels = np.where(mask)
            
            if len(matching_pixels[0]) > 0:
                # Convert first few matches to geographic coordinates
                geo_locations = []
                pixel_locations = []
                
                for i in range(min(5, len(matching_pixels[0]))):  # Show up to 5 matches
                    row = matching_pixels[0][i]
                    col = matching_pixels[1][i]
                    value = data_clean[row, col]
                    
                    # Convert to geographic coordinates
                    lon = transform[2] + (col + 0.5) * transform[0]
                    lat = transform[5] + (row + 0.5) * transform[4]  # transform[4] is negative
                    
                    geo_locations.append((lat, lon))
                    pixel_locations.append((row, col))
                
                matches[target_value] = {
                    'count': len(matching_pixels[0]),
                    'sample_pixels': pixel_locations,
                    'sample_geo': geo_locations
                }
                
                print(f"  ✅ Found {len(matching_pixels[0])} pixels with value ~{target_value:.1f}")
                print(f"     Sample locations: {geo_locations[0]} (pixel {pixel_locations[0]})")
            else:
                matches[target_value] = {'count': 0}
                print(f"  ❌ No pixels found with value ~{target_value:.1f}")
        
        return matches

def main():
    """Check for population overlap by examining center values."""
    
    assets = [
        ("CHN_1566584", "input_geotiffs/CHN/1566584-pop-v3.tiff"),
        ("CHN_1566601", "input_geotiffs/CHN/1566601-pop-v3.tiff"),  # Reference (most central)
        ("CHN_38089178", "input_geotiffs/CHN/38089178-pop-v3.tiff")
    ]
    
    print("🔍 POPULATION OVERLAP VERIFICATION")
    print("=" * 60)
    print("Checking if CHN_1566601 center values appear in other TIFFs...")
    
    # Step 1: Analyze CHN_1566601's center region
    reference_analysis = None
    for asset_name, tiff_path in assets:
        if asset_name == "CHN_1566601":
            reference_analysis = analyze_center_population(tiff_path, asset_name)
            break
    
    if not reference_analysis:
        print("❌ Failed to analyze reference asset CHN_1566601")
        return
    
    # Step 2: Extract top values to search for
    top_values = [value for value, count in reference_analysis['top_values'][:10]]
    
    print(f"\n🎯 SEARCHING FOR REFERENCE VALUES:")
    print(f"Looking for these CHN_1566601 center values: {[f'{v:.1f}' for v in top_values]}")
    
    # Step 3: Search for these values in the other two TIFFs
    for asset_name, tiff_path in assets:
        if asset_name != "CHN_1566601":
            matches = find_values_in_tiff(tiff_path, top_values, asset_name)
            
            # Summary
            found_values = [v for v, data in matches.items() if data['count'] > 0]
            missing_values = [v for v, data in matches.items() if data['count'] == 0]
            
            print(f"\n📊 SUMMARY for {asset_name}:")
            print(f"  Found {len(found_values)}/{len(top_values)} reference values")
            print(f"  Found values: {[f'{v:.1f}' for v in found_values]}")
            print(f"  Missing values: {[f'{v:.1f}' for v in missing_values]}")
            
            if len(found_values) >= len(top_values) * 0.7:  # 70% threshold
                print(f"  ✅ SIGNIFICANT OVERLAP DETECTED ({len(found_values)}/{len(top_values)} values found)")
            elif len(found_values) > 0:
                print(f"  ⚠️  PARTIAL OVERLAP ({len(found_values)}/{len(top_values)} values found)")
            else:
                print(f"  ❌ NO OVERLAP DETECTED - Different population data entirely!")

if __name__ == "__main__":
    main()