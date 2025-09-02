#!/usr/bin/env python3
"""
Fix bounds in overlay files by restoring original precision from raw data files.
"""

import json
import os
from pathlib import Path

def fix_asset_bounds():
    """Fix bounds in overlay files using raw data as source."""
    
    raw_data_dir = Path("raw_data")
    overlays_dir = Path("overlays") 
    
    fixed_count = 0
    
    # Process all raw data files
    for raw_file in raw_data_dir.glob("*_raw.json"):
        try:
            # Load raw data
            with open(raw_file, 'r') as f:
                raw_data = json.load(f)
            
            asset_id = raw_data['asset_id']
            country = raw_data['country']
            
            # Find corresponding overlay file
            overlay_file = overlays_dir / f"{country}_{asset_id}_data.json"
            
            if not overlay_file.exists():
                print(f"Overlay file not found: {overlay_file}")
                continue
                
            # Load overlay data
            with open(overlay_file, 'r') as f:
                overlay_data = json.load(f)
            
            # Check if bounds need fixing (if east == west or north == south)
            old_bounds = overlay_data['bounds']
            if (old_bounds['east'] == old_bounds['west'] or 
                old_bounds['north'] == old_bounds['south']):
                
                # Update bounds with raw data precision
                overlay_data['bounds'] = raw_data['bounds'].copy()
                
                # Write back to overlay file
                with open(overlay_file, 'w') as f:
                    json.dump(overlay_data, f, separators=(',', ':'))
                
                print(f"✓ Fixed bounds for {country}_{asset_id}")
                print(f"  Old: {old_bounds}")
                print(f"  New: {overlay_data['bounds']}")
                fixed_count += 1
            
        except Exception as e:
            print(f"✗ Error processing {raw_file}: {e}")
    
    print(f"\nFixed bounds for {fixed_count} assets")

if __name__ == "__main__":
    fix_asset_bounds()