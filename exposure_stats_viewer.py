#!/usr/bin/env python3
"""
Display exposure statistics from assets.json metadata in a formatted way.
"""

import json
import numpy as np


def format_exposure_value(value: float) -> str:
    """Format exposure values with appropriate units."""
    if value >= 1_000_000:
        return f"{value/1_000_000:.1f}M"
    elif value >= 1_000:
        return f"{value/1_000:.0f}K"
    else:
        return f"{value:.0f}"


def display_exposure_statistics(assets_file: str = 'assets.json') -> None:
    """Display exposure statistics from assets.json metadata."""
    try:
        with open(assets_file, 'r') as f:
            data = json.load(f)
        
        metadata = data['metadata']
        
        print("📊 PM2.5 PERSON-EXPOSURE STATISTICS")
        print("=" * 50)
        print(f"Processing Date: {metadata.get('processed_date', 'N/A')}")
        print(f"Total Assets: {metadata.get('total_assets', 0):,}")
        print(f"Countries: {len(metadata.get('countries', []))}")
        print(f"Script Version: {metadata.get('script_version', 'N/A')}")
        print()
        
        # Max person-exposure statistics
        if 'max_person_exposure_stats' in metadata:
            print("🏔️  MAX PERSON-EXPOSURE PER ASSET")
            print("-" * 35)
            stats = metadata['max_person_exposure_stats']
            
            print(f"Range:           {format_exposure_value(stats['min'])} - {format_exposure_value(stats['max'])} person⋅μg/m³")
            print(f"Mean:            {format_exposure_value(stats['mean'])} person⋅μg/m³")
            print(f"Median:          {format_exposure_value(stats['median'])} person⋅μg/m³")
            print(f"Geometric Mean:  {format_exposure_value(stats['geometric_mean'])} person⋅μg/m³")
            print(f"90th Percentile: {format_exposure_value(stats['percentile_90'])} person⋅μg/m³")
            print(f"95th Percentile: {format_exposure_value(stats['percentile_95'])} person⋅μg/m³")
            print(f"99th Percentile: {format_exposure_value(stats['percentile_99'])} person⋅μg/m³")
            print()
        
        # Total person-exposure statistics
        if 'total_person_exposure_stats' in metadata:
            print("📈 TOTAL PERSON-EXPOSURE PER ASSET")
            print("-" * 35)
            stats = metadata['total_person_exposure_stats']
            
            print(f"Range:           {format_exposure_value(stats['min'])} - {format_exposure_value(stats['max'])} person⋅μg/m³")
            print(f"Mean:            {format_exposure_value(stats['mean'])} person⋅μg/m³")
            print(f"Median:          {format_exposure_value(stats['median'])} person⋅μg/m³")
            print(f"Geometric Mean:  {format_exposure_value(stats['geometric_mean'])} person⋅μg/m³")
            print()
            print(f"🌍 GLOBAL TOTAL: {format_exposure_value(stats['sum_all_assets'])} person⋅μg/m³")
            print(f"   across all {stats['count']} industrial assets")
            print()
        
        # File information
        file_size_mb = len(json.dumps(data)) / (1024 * 1024)
        print("📄 DATA FILE INFORMATION")
        print("-" * 25)
        print(f"assets.json size: {file_size_mb:.1f} MB")
        print(f"Metadata keys: {len(metadata)} fields")
        print(f"Asset records: {len(data.get('assets', []))}")
        
    except FileNotFoundError:
        print(f"❌ Error: {assets_file} not found")
    except json.JSONDecodeError:
        print(f"❌ Error: Invalid JSON in {assets_file}")
    except Exception as e:
        print(f"❌ Error: {e}")


def generate_ascii_histogram(assets_file: str = 'assets.json', metric: str = 'max') -> None:
    """Generate ASCII histogram for exposure values."""
    try:
        with open(assets_file, 'r') as f:
            data = json.load(f)
        
        # Extract values based on metric
        values = []
        for asset in data['assets']:
            if 'person_exposure_stats' in asset:
                if metric == 'max':
                    values.append(asset['person_exposure_stats']['max_person_exposure'])
                elif metric == 'total':
                    values.append(asset['person_exposure_stats']['total_person_exposure'])
        
        if not values:
            print("No exposure data found")
            return
            
        values = np.array(values)
        non_zero_values = values[values > 0]
        
        if len(non_zero_values) == 0:
            print("No non-zero exposure values found")
            return
        
        # Create log-scale bins
        log_min = np.log10(np.min(non_zero_values))
        log_max = np.log10(np.max(non_zero_values))
        n_bins = 12
        log_bins = np.linspace(log_min, log_max, n_bins + 1)
        linear_bins = 10 ** log_bins
        
        # Calculate histogram
        hist, bin_edges = np.histogram(non_zero_values, bins=linear_bins)
        
        print(f"📊 {metric.upper()} PERSON-EXPOSURE DISTRIBUTION (LOG SCALE)")
        print("=" * 60)
        print("Range (person⋅μg/m³)                    Count  Histogram")
        print("-" * 60)
        
        max_count = np.max(hist)
        for i in range(len(hist)):
            start = bin_edges[i]
            end = bin_edges[i + 1]
            count = hist[i]
            
            range_str = f"{format_exposure_value(start)} - {format_exposure_value(end)}"
            
            # Create ASCII bar
            if count > 0:
                bar_length = int(30 * count / max_count)
                bar = '█' * bar_length
            else:
                bar = ''
            
            print(f"{range_str:<30} {count:>5}  {bar}")
            
    except Exception as e:
        print(f"❌ Error generating histogram: {e}")


def main():
    """Main function to display all statistics."""
    import sys
    
    if len(sys.argv) > 1:
        if sys.argv[1] == 'histogram':
            metric = sys.argv[2] if len(sys.argv) > 2 else 'max'
            generate_ascii_histogram(metric=metric)
        else:
            display_exposure_statistics(sys.argv[1])
    else:
        display_exposure_statistics()


if __name__ == '__main__':
    main()