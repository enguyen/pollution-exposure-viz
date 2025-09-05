#!/usr/bin/env python3

import json
import os
from pathlib import Path

def fix_overlay_bounds(overlay_file):
    """Fix bounds in overlay data to match transform matrix"""
    
    print(f"Processing {overlay_file}")
    
    # Load overlay data
    with open(overlay_file, 'r') as f:
        data = json.load(f)
    
    # Get transform matrix and dimensions
    transform = data['transform']
    dimensions = data['dimensions']
    width = dimensions['width']
    height = dimensions['height']
    
    # Extract transform components
    # [scale_x, 0, top_left_x, 0, scale_y, top_left_y, 0, 0, 1]
    scale_x = transform[0]  # degrees per pixel in X
    scale_y = transform[4]  # degrees per pixel in Y (usually negative)
    top_left_x = transform[2]  # longitude of top-left corner
    top_left_y = transform[5]  # latitude of top-left corner
    
    print(f"Transform: scale_x={scale_x}, scale_y={scale_y}, top_left=({top_left_y}, {top_left_x})")
    print(f"Dimensions: {width}x{height}")
    
    # Calculate actual bounds from transform matrix
    # Top-left corner is at (top_left_y, top_left_x)
    # Bottom-right corner is at (top_left_y + height*scale_y, top_left_x + width*scale_x)
    
    north = top_left_y
    south = top_left_y + (height - 1) * scale_y  # -1 because we want edge of last pixel
    west = top_left_x  
    east = top_left_x + (width - 1) * scale_x   # -1 because we want edge of last pixel
    
    # Ensure north > south (handle negative scale_y)
    if north < south:
        north, south = south, north
    
    # Ensure east > west (handle negative scale_x) 
    if west > east:
        west, east = east, west
    
    correct_bounds = {
        'north': float(north),
        'south': float(south), 
        'east': float(east),
        'west': float(west)
    }
    
    print(f"Original bounds: {data['bounds']}")
    print(f"Corrected bounds: {correct_bounds}")
    
    # Check if correction is needed
    original = data['bounds']
    needs_fix = (
        abs(original['north'] - correct_bounds['north']) > 0.001 or
        abs(original['south'] - correct_bounds['south']) > 0.001 or
        abs(original['east'] - correct_bounds['east']) > 0.001 or
        abs(original['west'] - correct_bounds['west']) > 0.001
    )
    
    if needs_fix:
        print("❌ Bounds need correction")
        
        # Update bounds
        data['bounds'] = correct_bounds
        
        # Create backup
        backup_file = str(overlay_file) + '.backup'
        if not os.path.exists(backup_file):
            original_data = dict(data)
            original_data['bounds'] = original
            with open(backup_file, 'w') as f:
                json.dump(original_data, f)
            print(f"Created backup: {backup_file}")
        
        # Save corrected data
        with open(overlay_file, 'w') as f:
            json.dump(data, f)
        print(f"✅ Corrected bounds in {overlay_file}")
        
        return True
    else:
        print("✅ Bounds are already correct")
        return False

if __name__ == "__main__":
    # Test with BRA first
    bra_file = Path('frontend/overlays/BRA_1566450_data.json')
    if bra_file.exists():
        print("=== Testing with BRA_1566450 ===")
        fix_overlay_bounds(bra_file)
        print()
    
    # Test with KOR  
    kor_file = Path('frontend/overlays/KOR_1566957_data.json')
    if kor_file.exists():
        print("=== Testing with KOR_1566957 ===")
        fix_overlay_bounds(kor_file)
        print()