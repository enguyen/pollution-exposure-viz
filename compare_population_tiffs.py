#!/usr/bin/env python3
"""
Compare population TIFF files across multiple assets to verify spatial alignment.
We'll look for unique population patterns and check if they appear at the same coordinates.
"""

import rasterio
import numpy as np
from collections import Counter
import json

def analyze_population_tiff(tiff_path, asset_name):
    """Analyze a population TIFF and extract spatial patterns."""
    
    with rasterio.open(tiff_path) as src:
        data = src.read(1)
        bounds = src.bounds
        transform = src.transform
        
        # Clean the data
        data_clean = np.where(np.isfinite(data) & (data >= 0), data, 0)
        
        print(f"\n📊 ANALYZING {asset_name}:")
        print(f"  File: {tiff_path}")
        print(f"  Bounds: N={bounds.top:.6f}, S={bounds.bottom:.6f}, E={bounds.right:.6f}, W={bounds.left:.6f}")
        print(f"  Transform: {transform}")
        print(f"  Shape: {data_clean.shape}")
        print(f"  Non-zero pixels: {np.sum(data_clean > 0)}")
        print(f"  Max population: {np.max(data_clean):.1f}")
        
        # Find unique population values and their locations
        unique_values = []
        nonzero_rows, nonzero_cols = np.where(data_clean > 0)
        
        if len(nonzero_rows) > 0:
            # Get population value distribution
            pop_values = data_clean[nonzero_rows, nonzero_cols]
            value_counts = Counter(pop_values.round(1))  # Round to 0.1 for grouping
            
            # Find moderately rare values (not too common, not too rare)
            interesting_values = []
            total_pixels = len(pop_values)
            
            for value, count in value_counts.most_common():
                frequency = count / total_pixels
                if 0.001 < frequency < 0.01 and value > 10:  # 0.1%-1% frequency, meaningful population
                    interesting_values.append((value, count))
                    if len(interesting_values) >= 5:
                        break
            
            print(f"  Interesting population values (0.1%-1% frequency):")
            for value, count in interesting_values:
                print(f"    {value:.1f} people: {count} pixels ({count/total_pixels*100:.2f}%)")
            
            # Find locations of the most interesting value
            if interesting_values:
                target_value = interesting_values[0][0]
                target_locations = []
                
                for i, (row, col) in enumerate(zip(nonzero_rows, nonzero_cols)):
                    if abs(data_clean[row, col] - target_value) < 0.1:
                        # Convert to geographic coordinates
                        lon = transform[2] + (col + 0.5) * transform[0]
                        lat = transform[5] + (row + 0.5) * transform[4]  # Note: transform[4] is usually negative
                        target_locations.append({
                            'pixel': (row, col),
                            'geo': (lat, lon),
                            'value': float(data_clean[row, col])
                        })
                        if len(target_locations) >= 10:  # Limit to first 10 locations
                            break
                
                return {
                    'asset_name': asset_name,
                    'bounds': {
                        'north': float(bounds.top),
                        'south': float(bounds.bottom), 
                        'east': float(bounds.right),
                        'west': float(bounds.left)
                    },
                    'transform': list(transform),
                    'shape': data_clean.shape,
                    'target_value': target_value,
                    'target_locations': target_locations,
                    'total_nonzero': int(np.sum(data_clean > 0)),
                    'max_value': float(np.max(data_clean))
                }
        
        return None

def compare_spatial_alignment(analyses):
    """Compare the spatial alignment of target locations across assets."""
    
    if len(analyses) < 2:
        print("❌ Need at least 2 assets for comparison")
        return
    
    print(f"\n🔍 SPATIAL ALIGNMENT COMPARISON:")
    print("=" * 60)
    
    # Use first asset as reference
    reference = analyses[0]
    ref_name = reference['asset_name']
    ref_value = reference['target_value']
    ref_locations = reference['target_locations']
    
    print(f"📍 Reference: {ref_name} (population value ~{ref_value:.1f})")
    print(f"   Found {len(ref_locations)} locations with this value")
    
    if not ref_locations:
        print("❌ No reference locations found")
        return
    
    # Show first few reference locations
    print("   Sample reference locations:")
    for i, loc in enumerate(ref_locations[:3]):
        print(f"     {i+1}. Pixel ({loc['pixel'][0]}, {loc['pixel'][1]}) = Geo ({loc['geo'][0]:.6f}, {loc['geo'][1]:.6f})")
    
    # Compare with other assets
    for comparison in analyses[1:]:
        comp_name = comparison['asset_name']
        comp_locations = comparison['target_locations']
        comp_value = comparison['target_value']
        
        print(f"\n🔍 Comparing with {comp_name} (population value ~{comp_value:.1f}):")
        
        if not comp_locations:
            print("   ❌ No comparison locations found")
            continue
        
        # Check if any reference locations appear in comparison asset
        matches = []
        geo_matches = []
        
        for ref_loc in ref_locations:
            ref_geo = ref_loc['geo']
            
            # Look for matches in geographic coordinates (within tolerance)
            for comp_loc in comp_locations:
                comp_geo = comp_loc['geo']
                lat_diff = abs(ref_geo[0] - comp_geo[0])
                lon_diff = abs(ref_geo[1] - comp_geo[1])
                
                # Use pixel-level tolerance (about 0.003333° per pixel)
                tolerance = 0.005  # About 1.5 pixels
                
                if lat_diff < tolerance and lon_diff < tolerance:
                    matches.append({
                        'ref': ref_loc,
                        'comp': comp_loc,
                        'geo_diff': (lat_diff, lon_diff)
                    })
                    
                    # Also check pixel coordinates
                    pixel_diff = (
                        abs(ref_loc['pixel'][0] - comp_loc['pixel'][0]),
                        abs(ref_loc['pixel'][1] - comp_loc['pixel'][1])
                    )
                    geo_matches.append({
                        'geo_diff': (lat_diff, lon_diff),
                        'pixel_diff': pixel_diff
                    })
                    break
        
        print(f"   Geographic matches: {len(matches)}/{len(ref_locations)}")
        
        if matches:
            print("   ✅ SPATIAL ALIGNMENT DETECTED")
            avg_lat_diff = np.mean([m['geo_diff'][0] for m in geo_matches])
            avg_lon_diff = np.mean([m['geo_diff'][1] for m in geo_matches])
            max_lat_diff = np.max([m['geo_diff'][0] for m in geo_matches])
            max_lon_diff = np.max([m['geo_diff'][1] for m in geo_matches])
            
            print(f"   Average coordinate difference: {avg_lat_diff:.6f}°, {avg_lon_diff:.6f}°")
            print(f"   Maximum coordinate difference: {max_lat_diff:.6f}°, {max_lon_diff:.6f}°")
            
            # Show sample matches
            for i, match in enumerate(matches[:2]):
                ref = match['ref']
                comp = match['comp']
                print(f"   Match {i+1}: ({ref['geo'][0]:.6f}, {ref['geo'][1]:.6f}) vs ({comp['geo'][0]:.6f}, {comp['geo'][1]:.6f})")
        else:
            print("   ❌ NO SPATIAL ALIGNMENT - Population data appears to be in different locations!")
            
            # Show what we found instead
            print("   Sample locations in comparison asset:")
            for i, loc in enumerate(comp_locations[:3]):
                print(f"     {i+1}. Pixel ({loc['pixel'][0]}, {loc['pixel'][1]}) = Geo ({loc['geo'][0]:.6f}, {loc['geo'][1]:.6f})")

def main():
    """Compare population TIFF files for spatial alignment."""
    
    # The three problematic assets
    assets = [
        ("CHN_1566584", "input_geotiffs/CHN/1566584-pop-v3.tiff"),
        ("CHN_1566601", "input_geotiffs/CHN/1566601-pop-v3.tiff"), 
        ("CHN_38089178", "input_geotiffs/CHN/38089178-pop-v3.tiff")
    ]
    
    print("🔍 POPULATION TIFF SPATIAL ALIGNMENT ANALYSIS")
    print("=" * 60)
    print("Looking for unique population patterns to verify spatial alignment...")
    
    analyses = []
    
    for asset_name, tiff_path in assets:
        try:
            analysis = analyze_population_tiff(tiff_path, asset_name)
            if analysis:
                analyses.append(analysis)
        except Exception as e:
            print(f"❌ Error analyzing {asset_name}: {e}")
    
    if len(analyses) >= 2:
        compare_spatial_alignment(analyses)
        
        # Save detailed analysis
        output_file = "population_alignment_analysis.json"
        with open(output_file, 'w') as f:
            json.dump(analyses, f, indent=2)
        print(f"\n📁 Detailed analysis saved to: {output_file}")
    else:
        print("❌ Not enough valid analyses for comparison")

if __name__ == "__main__":
    main()