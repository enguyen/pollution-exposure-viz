#!/usr/bin/env python3
"""
Convert raw data files to new overlay data format.
Creates separate JSON files for each asset with concentration and population arrays.
Removes dependency on PNG files and optimizes for the new visualization approach.
"""

import json
import os
import glob
from pathlib import Path

def create_overlay_data():
    """Process all raw data files and create new overlay data format."""
    
    raw_data_dir = Path("raw_data")
    overlays_dir = Path("overlays")
    
    # Create overlays directory if it doesn't exist
    overlays_dir.mkdir(exist_ok=True)
    
    # Process all raw data files
    raw_files = list(raw_data_dir.glob("*_raw.json"))
    print(f"Processing {len(raw_files)} raw data files...")
    
    processed_count = 0
    
    for raw_file in raw_files:
        try:
            # Load raw data
            with open(raw_file, 'r') as f:
                raw_data = json.load(f)
            
            asset_id = raw_data['asset_id']
            country = raw_data['country']
            
            # Extract the separate data arrays
            person_exposure_data = raw_data['data']['person_exposure']
            concentration_data = raw_data['data'].get('concentration', None)
            population_data = raw_data['data'].get('population', None)
            
            # If concentration/population are missing, derive them from person_exposure
            if concentration_data is None or population_data is None:
                print(f"Warning: {country}_{asset_id} missing separate concentration/population data")
                # Skip for now - would need the original GeoTIFF files to derive these
                continue
            
            # Create new overlay data format
            overlay_data = {
                "asset_id": asset_id,
                "country": country,
                "dimensions": raw_data['dimensions'],
                "bounds": raw_data['bounds'],
                "transform": raw_data['transform'],
                "data_arrays": {
                    "concentration": concentration_data,  # PM2.5 concentration in µg/m³
                    "population": population_data,        # Population density
                    "person_exposure": person_exposure_data  # Calculated person-exposure
                },
                "metadata": {
                    "created_from": str(raw_file.name),
                    "data_version": "v3_best_practices"
                }
            }
            
            # Write to overlays directory
            output_file = overlays_dir / f"{country}_{asset_id}_data.json"
            with open(output_file, 'w') as f:
                json.dump(overlay_data, f, separators=(',', ':'))  # Compact format
            
            processed_count += 1
            print(f"✓ Created {output_file}")
            
        except Exception as e:
            print(f"✗ Error processing {raw_file}: {e}")
    
    print(f"\nCompleted: {processed_count}/{len(raw_files)} files processed")
    
    # Clean up old PNG files
    png_files = list(overlays_dir.glob("*.png"))
    if png_files:
        print(f"\nFound {len(png_files)} PNG files to remove...")
        response = input("Remove PNG files? (y/N): ").strip().lower()
        if response == 'y':
            for png_file in png_files:
                png_file.unlink()
                print(f"✓ Removed {png_file}")
            print("PNG cleanup complete")
    
    return processed_count

if __name__ == "__main__":
    create_overlay_data()