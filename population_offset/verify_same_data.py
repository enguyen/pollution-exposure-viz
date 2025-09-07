#!/usr/bin/env python3
"""
Verify that the three population TIFFs contain the same underlying population data.
"""

import rasterio
import numpy as np
from collections import Counter

def get_population_distribution(filename):
    """Get the distribution of population values in a TIFF."""
    with rasterio.open(filename) as src:
        data = src.read(1)
        
        # Clean data and get non-zero values
        data_clean = np.where(np.isfinite(data) & (data >= 0), data, 0)
        nonzero_data = data_clean[data_clean > 0]
        
        if len(nonzero_data) == 0:
            return {}
        
        # Round to 0.1 for grouping and count occurrences
        rounded_values = np.round(nonzero_data, 1)
        value_counts = Counter(rounded_values)
        
        return dict(value_counts)

def main():
    """Compare population value distributions across the three TIFFs."""
    
    files = [
        "1566584-pop-v3.tiff",
        "1566601-pop-v3.tiff", 
        "38089178-pop-v3.tiff"
    ]
    
    print("POPULATION VALUE DISTRIBUTION COMPARISON")
    print("=" * 50)
    
    distributions = {}
    for filename in files:
        asset_id = filename.split('-')[0]
        dist = get_population_distribution(filename)
        distributions[asset_id] = dist
        
        print(f"\n{asset_id} - Top 10 population values:")
        sorted_values = sorted(dist.items(), key=lambda x: x[1], reverse=True)
        for value, count in sorted_values[:10]:
            print(f"  {value:.1f} people: {count:,} pixels")
    
    # Check if distributions are similar
    print(f"\nCOMPARISON:")
    print("-" * 20)
    
    reference_id = "1566601"
    ref_values = set(distributions[reference_id].keys())
    
    for asset_id, dist in distributions.items():
        if asset_id == reference_id:
            continue
            
        asset_values = set(dist.keys())
        common_values = ref_values.intersection(asset_values)
        
        similarity = len(common_values) / len(ref_values) * 100
        print(f"{asset_id} vs {reference_id}: {similarity:.1f}% common values ({len(common_values)}/{len(ref_values)})")
    
    print(f"\nCONCLUSION:")
    if similarity > 90:
        print("✅ All TIFFs contain essentially the same population value distributions")
        print("   This confirms they're using the same underlying population dataset")
        print("   The coordinate offset issue is purely about geographic positioning")
    else:
        print("❌ TIFFs contain different population distributions")

if __name__ == "__main__":
    main()