#!/usr/bin/env python3
"""
Reduce numerical precision in overlay JSON files to decrease file sizes.
Rounds floating point numbers to specified significant digits while preserving data quality.
"""

import json
import os
import glob
from pathlib import Path
import math

def round_to_significant_digits(num, sig_digits=3):
    """Round a number to specified significant digits."""
    if num == 0:
        return 0
    
    # Handle negative numbers
    sign = -1 if num < 0 else 1
    num = abs(num)
    
    # Calculate the power of 10 for rounding
    power = sig_digits - int(math.floor(math.log10(num))) - 1
    
    # Round and restore sign
    rounded = round(num, power)
    return sign * rounded

def process_data_structure(data, sig_digits=3):
    """Recursively process data structure to reduce precision."""
    if isinstance(data, dict):
        return {key: process_data_structure(value, sig_digits) for key, value in data.items()}
    elif isinstance(data, list):
        return [process_data_structure(item, sig_digits) for item in data]
    elif isinstance(data, float):
        return round_to_significant_digits(data, sig_digits)
    else:
        return data

def reduce_overlay_precision(input_dir="overlays", output_dir="overlays", sig_digits=3):
    """
    Process all overlay files to reduce numerical precision.
    
    Args:
        input_dir: Directory containing original overlay files
        output_dir: Directory for processed files
        sig_digits: Number of significant digits to preserve
    """
    
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    
    # Create output directory
    output_path.mkdir(exist_ok=True)
    
    # Get all JSON files
    json_files = list(input_path.glob("*_data.json"))
    
    print(f"Processing {len(json_files)} overlay files...")
    print(f"Reducing precision to {sig_digits} significant digits")
    
    total_original_size = 0
    total_reduced_size = 0
    processed_count = 0
    
    for json_file in json_files:
        try:
            # Get original file size
            original_size = json_file.stat().st_size
            total_original_size += original_size
            
            # Load and process data
            with open(json_file, 'r') as f:
                data = json.load(f)
            
            # Reduce precision
            processed_data = process_data_structure(data, sig_digits)
            
            # Save processed data
            output_file = output_path / json_file.name
            with open(output_file, 'w') as f:
                json.dump(processed_data, f, separators=(',', ':'))  # Compact JSON
            
            # Get reduced file size
            reduced_size = output_file.stat().st_size
            total_reduced_size += reduced_size
            
            reduction_percent = ((original_size - reduced_size) / original_size) * 100
            
            print(f"✓ {json_file.name}: {original_size:,} → {reduced_size:,} bytes ({reduction_percent:.1f}% reduction)")
            
            processed_count += 1
            
        except Exception as e:
            print(f"✗ Error processing {json_file.name}: {e}")
    
    # Summary statistics
    total_reduction_percent = ((total_original_size - total_reduced_size) / total_original_size) * 100
    
    print(f"\n📊 Summary:")
    print(f"Files processed: {processed_count}")
    print(f"Original total size: {total_original_size / (1024*1024):.1f} MB")
    print(f"Reduced total size: {total_reduced_size / (1024*1024):.1f} MB") 
    print(f"Total size reduction: {total_reduction_percent:.1f}%")
    print(f"Space saved: {(total_original_size - total_reduced_size) / (1024*1024):.1f} MB")

def test_precision_example():
    """Test the precision reduction on sample values."""
    test_values = [
        0.026884429156780243,
        0.08343540877103806,
        1.7642385993480682,
        0.0001145737012848258,
        123.456789,
        0.000000123456789
    ]
    
    print("🧪 Precision Reduction Examples:")
    for val in test_values:
        for digits in [2, 3, 4]:
            reduced = round_to_significant_digits(val, digits)
            print(f"  {val} → {reduced} ({digits} sig digits)")
        print()

if __name__ == "__main__":
    print("🔢 Overlay Data Precision Reducer")
    print("=" * 50)
    
    # Show examples first
    test_precision_example()
    
    # Process files
    print("\n📁 Processing overlay files...")
    reduce_overlay_precision(sig_digits=2)