#!/usr/bin/env python3
"""
Process the specific assets that were causing alignment issues.
"""

from prototype_unified import process_asset_unified
from pathlib import Path
import shutil

def fix_problematic_assets():
    """Process the three problematic assets with corrected bounds calculation."""
    
    problematic_assets = [
        ("1566584", "CHN"),   # Reticle northwest of marker
        ("38089178", "CHN"),  # Reticle southwest of marker  
        ("1566601", "CHN")    # Reticle southeast of marker
    ]
    
    output_dir = "overlays"
    Path(output_dir).mkdir(exist_ok=True)
    
    print("🔧 FIXING PROBLEMATIC ASSETS")
    print("=" * 60)
    
    for asset_id, country in problematic_assets:
        try:
            print(f"\nProcessing {country}_{asset_id}...")
            
            # Process with corrected pipeline
            result = process_asset_unified(
                asset_id=asset_id,
                country=country,
                input_dir="input_geotiffs",
                output_dir="prototype_overlays",  # temp output first
                preserve_full_resolution=True,
                precision_digits=3
            )
            
            # Move to final location and rename to match frontend expectations
            temp_file = Path("prototype_overlays") / f"{country}_{asset_id}_data.json"
            final_file = Path(output_dir) / f"{country}_{asset_id}_data.json"
            
            if temp_file.exists():
                # Create backup of original if it exists
                if final_file.exists():
                    backup_file = final_file.with_suffix('.json.backup')
                    shutil.copy2(final_file, backup_file)
                    print(f"  Created backup: {backup_file}")
                
                # Move corrected file
                shutil.move(temp_file, final_file)
                print(f"  ✅ Updated: {final_file}")
            
        except Exception as e:
            print(f"  ❌ Error processing {country}_{asset_id}: {e}")
    
    print("\n" + "=" * 60)
    print("✅ Problematic assets reprocessed with corrected bounds calculation")
    print("🧪 Run verify_bounds_accuracy.py to confirm the fix")

if __name__ == "__main__":
    fix_problematic_assets()