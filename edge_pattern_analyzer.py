#!/usr/bin/env python3
"""
Analyze GeoTIFF files for contiguous zero edge patterns that might indicate 
missing data regions vs natural plume boundaries.
"""

import rasterio
import numpy as np
import os
import json
from typing import Dict, List, Tuple


def detect_edge_patterns(data: np.ndarray, threshold: float = 0.0) -> Dict:
    """
    Detect contiguous zero patterns along the edges of a raster.
    
    Args:
        data: 2D numpy array of raster data
        threshold: Values <= threshold are considered "zero"
        
    Returns:
        Dictionary with edge pattern information
    """
    rows, cols = data.shape
    
    # Check each edge for contiguous zero patterns
    patterns = {
        'top_zero_stripe': False,
        'bottom_zero_stripe': False,
        'left_zero_stripe': False,
        'right_zero_stripe': False,
        'top_zero_rows': 0,
        'bottom_zero_rows': 0,
        'left_zero_cols': 0,
        'right_zero_cols': 0
    }
    
    # Top edge - check how many full rows are zero from the top
    for i in range(rows):
        if np.all(data[i, :] <= threshold):
            patterns['top_zero_rows'] = i + 1
        else:
            break
    
    # Bottom edge - check how many full rows are zero from the bottom
    for i in range(rows-1, -1, -1):
        if np.all(data[i, :] <= threshold):
            patterns['bottom_zero_rows'] = rows - i
        else:
            break
    
    # Left edge - check how many full columns are zero from the left
    for j in range(cols):
        if np.all(data[:, j] <= threshold):
            patterns['left_zero_cols'] = j + 1
        else:
            break
    
    # Right edge - check how many full columns are zero from the right
    for j in range(cols-1, -1, -1):
        if np.all(data[:, j] <= threshold):
            patterns['right_zero_cols'] = cols - j
        else:
            break
    
    # Determine if we have significant edge stripes (>1% of dimension)
    min_stripe_threshold = max(10, min(rows, cols) * 0.01)
    
    patterns['top_zero_stripe'] = patterns['top_zero_rows'] > min_stripe_threshold
    patterns['bottom_zero_stripe'] = patterns['bottom_zero_rows'] > min_stripe_threshold
    patterns['left_zero_stripe'] = patterns['left_zero_cols'] > min_stripe_threshold
    patterns['right_zero_stripe'] = patterns['right_zero_cols'] > min_stripe_threshold
    
    return patterns


def analyze_concentration_file(file_path: str, country: str, asset_id: str) -> Dict:
    """
    Analyze a single concentration file for edge patterns.
    
    Args:
        file_path: Path to the GeoTIFF file
        country: Country code
        asset_id: Asset identifier
        
    Returns:
        Dictionary with analysis results
    """
    try:
        with rasterio.open(file_path) as src:
            data = src.read(1)
            
            # Basic statistics
            total_pixels = data.size
            zero_pixels = np.sum(data == 0)
            positive_pixels = np.sum(data > 0)
            
            # Detect edge patterns
            edge_patterns = detect_edge_patterns(data)
            
            # Find the extent of non-zero data
            if positive_pixels > 0:
                rows, cols = np.where(data > 0)
                data_extent = {
                    'min_row': int(np.min(rows)),
                    'max_row': int(np.max(rows)),
                    'min_col': int(np.min(cols)),
                    'max_col': int(np.max(cols))
                }
                
                # Check if data reaches edges
                reaches_edges = {
                    'reaches_top': data_extent['min_row'] == 0,
                    'reaches_bottom': data_extent['max_row'] == data.shape[0] - 1,
                    'reaches_left': data_extent['min_col'] == 0,
                    'reaches_right': data_extent['max_col'] == data.shape[1] - 1
                }
            else:
                data_extent = {'min_row': -1, 'max_row': -1, 'min_col': -1, 'max_col': -1}
                reaches_edges = {'reaches_top': False, 'reaches_bottom': False, 
                               'reaches_left': False, 'reaches_right': False}
            
            return {
                'country': country,
                'asset_id': asset_id,
                'file_path': file_path,
                'shape': [int(data.shape[0]), int(data.shape[1])],
                'total_pixels': int(total_pixels),
                'zero_pixels': int(zero_pixels),
                'positive_pixels': int(positive_pixels),
                'zero_percentage': float((zero_pixels / total_pixels) * 100),
                'data_extent': data_extent,
                'reaches_edges': reaches_edges,
                'edge_patterns': edge_patterns,
                'suspicious_patterns': bool(
                    edge_patterns['top_zero_stripe'] or 
                    edge_patterns['bottom_zero_stripe'] or
                    edge_patterns['left_zero_stripe'] or 
                    edge_patterns['right_zero_stripe']
                )
            }
            
    except Exception as e:
        return {
            'country': country,
            'asset_id': asset_id,
            'file_path': file_path,
            'error': str(e)
        }


def batch_analyze_edge_patterns(input_dir: str = 'input_geotiffs', analyze_both: bool = True) -> Dict[str, List[Dict]]:
    """
    Analyze concentration and/or population files for edge patterns.
    
    Args:
        input_dir: Directory containing country subdirectories
        analyze_both: If True, analyze both concentration and population files
        
    Returns:
        Dictionary with 'concentration' and 'population' keys containing analysis results
    """
    results = {'concentration': [], 'population': []}
    
    # Get all country directories
    country_dirs = [d for d in os.listdir(input_dir) 
                   if os.path.isdir(os.path.join(input_dir, d)) and len(d) == 3]
    
    for country in sorted(country_dirs):
        country_path = os.path.join(input_dir, country)
        
        if analyze_both:
            # Find all files
            all_files = [f for f in os.listdir(country_path) if f.endswith('-v2.tiff')]
            
            # Separate concentration and population files
            conc_files = [f for f in all_files if not f.endswith('-pop-v2.tiff')]
            pop_files = [f for f in all_files if f.endswith('-pop-v2.tiff')]
            
            # Analyze concentration files
            for file in sorted(conc_files):
                asset_id = file.replace('-v2.tiff', '')
                file_path = os.path.join(country_path, file)
                
                print(f"Analyzing concentration {country}_{asset_id}...")
                result = analyze_concentration_file(file_path, country, asset_id)
                result['file_type'] = 'concentration'
                results['concentration'].append(result)
            
            # Analyze population files
            for file in sorted(pop_files):
                asset_id = file.replace('-pop-v2.tiff', '')
                file_path = os.path.join(country_path, file)
                
                print(f"Analyzing population {country}_{asset_id}...")
                result = analyze_concentration_file(file_path, country, asset_id)  # Same function works for both
                result['file_type'] = 'population'
                results['population'].append(result)
        else:
            # Only concentration files (original behavior)
            files = [f for f in os.listdir(country_path) 
                    if f.endswith('-v2.tiff') and not f.endswith('-pop-v2.tiff')]
            
            for file in sorted(files):
                asset_id = file.replace('-v2.tiff', '')
                file_path = os.path.join(country_path, file)
                
                print(f"Analyzing concentration {country}_{asset_id}...")
                result = analyze_concentration_file(file_path, country, asset_id)
                result['file_type'] = 'concentration'
                results['concentration'].append(result)
    
    return results


def summarize_suspicious_patterns(results_dict: Dict[str, List[Dict]]) -> None:
    """
    Print summary of files with suspicious edge patterns for both file types.
    
    Args:
        results_dict: Dictionary with 'concentration' and 'population' analysis results
    """
    for file_type, results in results_dict.items():
        if not results:
            continue
            
        suspicious_files = [r for r in results if r.get('suspicious_patterns', False)]
        
        print(f"\n{'='*60}")
        print(f"SUSPICIOUS EDGE PATTERN SUMMARY - {file_type.upper()} FILES")
        print(f"{'='*60}")
        print(f"Total {file_type} files analyzed: {len(results)}")
        print(f"Files with suspicious edge patterns: {len(suspicious_files)}")
        
        if suspicious_files:
            print(f"\n{file_type.title()} files with contiguous zero edge stripes:")
            print(f"{'Country':<8} {'Asset ID':<12} {'Top':<6} {'Bottom':<8} {'Left':<6} {'Right':<7} {'Zero %':<8}")
            print(f"{'-'*60}")
            
            for result in suspicious_files[:20]:  # Show first 20 to avoid overwhelming output
                ep = result['edge_patterns']
                print(f"{result['country']:<8} {result['asset_id']:<12} "
                      f"{'Yes' if ep['top_zero_stripe'] else 'No':<6} "
                      f"{'Yes' if ep['bottom_zero_stripe'] else 'No':<8} "
                      f"{'Yes' if ep['left_zero_stripe'] else 'No':<6} "
                      f"{'Yes' if ep['right_zero_stripe'] else 'No':<7} "
                      f"{result['zero_percentage']:.1f}%")
            
            if len(suspicious_files) > 20:
                print(f"... and {len(suspicious_files) - 20} more files")
        
        # Summary by pattern type
        patterns_summary = {
            'top_stripes': len([r for r in suspicious_files if r['edge_patterns']['top_zero_stripe']]),
            'bottom_stripes': len([r for r in suspicious_files if r['edge_patterns']['bottom_zero_stripe']]),
            'left_stripes': len([r for r in suspicious_files if r['edge_patterns']['left_zero_stripe']]),
            'right_stripes': len([r for r in suspicious_files if r['edge_patterns']['right_zero_stripe']])
        }
        
        print(f"\n{file_type.title()} pattern breakdown:")
        for pattern, count in patterns_summary.items():
            if count > 0:
                print(f"  {pattern.replace('_', ' ').title()}: {count} files")
        
        # Additional statistics
        if results:
            zero_percentages = [r['zero_percentage'] for r in results if 'zero_percentage' in r]
            print(f"\n{file_type.title()} overall statistics:")
            print(f"  Average zero pixels: {np.mean(zero_percentages):.1f}%")
            print(f"  Median zero pixels: {np.median(zero_percentages):.1f}%")
            print(f"  Range: {np.min(zero_percentages):.1f}% - {np.max(zero_percentages):.1f}%")


def main():
    """Analyze both concentration and population files for edge patterns."""
    print("Edge Pattern Analyzer for PM2.5 Concentration and Population GeoTIFFs")
    print("="*70)
    
    # Analyze all files (both types)
    results_dict = batch_analyze_edge_patterns(analyze_both=True)
    
    # Save detailed results
    output_file = 'edge_pattern_analysis_complete.json'
    with open(output_file, 'w') as f:
        json.dump(results_dict, f, indent=2)
    print(f"\nDetailed results saved to: {output_file}")
    
    # Print summary for both file types
    summarize_suspicious_patterns(results_dict)
    
    # Comparison summary
    conc_results = results_dict.get('concentration', [])
    pop_results = results_dict.get('population', [])
    
    if conc_results and pop_results:
        conc_suspicious = len([r for r in conc_results if r.get('suspicious_patterns', False)])
        pop_suspicious = len([r for r in pop_results if r.get('suspicious_patterns', False)])
        
        print(f"\n{'='*60}")
        print(f"COMPARATIVE SUMMARY")
        print(f"{'='*60}")
        print(f"Concentration files: {conc_suspicious}/{len(conc_results)} suspicious ({conc_suspicious/len(conc_results)*100:.1f}%)")
        print(f"Population files: {pop_suspicious}/{len(pop_results)} suspicious ({pop_suspicious/len(pop_results)*100:.1f}%)")
        
        # Check for files with issues in both types
        conc_suspicious_assets = {(r['country'], r['asset_id']) for r in conc_results if r.get('suspicious_patterns', False)}
        pop_suspicious_assets = {(r['country'], r['asset_id']) for r in pop_results if r.get('suspicious_patterns', False)}
        
        both_suspicious = conc_suspicious_assets & pop_suspicious_assets
        conc_only = conc_suspicious_assets - pop_suspicious_assets
        pop_only = pop_suspicious_assets - conc_suspicious_assets
        
        print(f"\nAsset breakdown:")
        print(f"  Both files suspicious: {len(both_suspicious)} assets")
        print(f"  Only concentration suspicious: {len(conc_only)} assets")
        print(f"  Only population suspicious: {len(pop_only)} assets")


if __name__ == '__main__':
    main()