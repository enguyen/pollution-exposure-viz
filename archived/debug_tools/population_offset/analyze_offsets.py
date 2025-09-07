#!/usr/bin/env python3
"""
Minimal script to demonstrate the population TIFF coordinate offset issue.
Shows that the same population data appears at different geographic locations.
"""

import rasterio
import numpy as np
import math

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance in kilometers between two lat/lon points."""
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    return 6371 * 2 * math.asin(math.sqrt(a))

def calculate_bearing(lat1, lon1, lat2, lon2):
    """Calculate bearing from point 1 to point 2 in degrees."""
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlon = lon2 - lon1
    y = math.sin(dlon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    bearing = math.degrees(math.atan2(y, x))
    return (bearing + 360) % 360

def analyze_population_offsets():
    """Analyze coordinate offsets between population TIFFs."""
    
    files = [
        "1566584-pop-v3.tiff",
        "1566601-pop-v3.tiff", 
        "38089178-pop-v3.tiff"
    ]
    
    print("POPULATION TIFF COORDINATE OFFSET ANALYSIS")
    print("=" * 50)
    
    # Get center coordinates for each TIFF
    centers = {}
    for filename in files:
        asset_id = filename.split('-')[0]
        
        with rasterio.open(filename) as src:
            bounds = src.bounds
            center_lat = (bounds.top + bounds.bottom) / 2
            center_lon = (bounds.left + bounds.right) / 2
            
            centers[asset_id] = (center_lat, center_lon)
            
            print(f"{asset_id}: {center_lat:.6f}°N, {center_lon:.6f}°E")
    
    # Calculate offsets using 1566601 as reference
    reference_id = "1566601"
    ref_lat, ref_lon = centers[reference_id]
    
    print(f"\nOFFSETS FROM {reference_id}:")
    print("-" * 30)
    
    for asset_id, (lat, lon) in centers.items():
        if asset_id == reference_id:
            continue
            
        distance = haversine_distance(ref_lat, ref_lon, lat, lon)
        bearing = calculate_bearing(ref_lat, ref_lon, lat, lon)
        
        lat_offset = lat - ref_lat
        lon_offset = lon - ref_lon
        
        # Convert to km
        north_km = haversine_distance(ref_lat, ref_lon, lat, ref_lon)
        east_km = haversine_distance(ref_lat, ref_lon, ref_lat, lon)
        
        if lat_offset < 0:
            north_km = -north_km
        if lon_offset < 0:
            east_km = -east_km
        
        direction = "N" if bearing < 22.5 or bearing > 337.5 else \
                   "NE" if bearing < 67.5 else \
                   "E" if bearing < 112.5 else \
                   "SE" if bearing < 157.5 else \
                   "S" if bearing < 202.5 else \
                   "SW" if bearing < 247.5 else \
                   "W" if bearing < 292.5 else "NW"
        
        print(f"{asset_id}: {distance:.1f}km {direction} ({north_km:+.1f}km N, {east_km:+.1f}km E)")
    
    print(f"\nCONCLUSION:")
    print("The same population dataset appears at different geographic")
    print("coordinates for each asset, indicating a coordinate system bug.")

def analyze_population_value_sequences():
    """Analyze specific population value sequences to verify coordinate system consistency."""
    
    files = [
        "1566584-pop-v3.tiff",
        "1566601-pop-v3.tiff", 
        "38089178-pop-v3.tiff"
    ]
    
    print(f"\n" + "="*60)
    print("POPULATION VALUE SEQUENCE COORDINATE ANALYSIS")
    print("="*60)
    
    # Target sequence found in our frontend testing: [16.0, 5.42, 5.36]
    target_sequence = [16.0, 5.42, 5.36]
    print(f"Target sequence: {target_sequence}")
    
    sequence_locations = {}
    
    # Search for this exact sequence in each TIFF
    for filename in files:
        asset_id = filename.split('-')[0]
        print(f"\n🔍 Analyzing {asset_id}:")
        
        try:
            with rasterio.open(filename) as src:
                data = src.read(1)
                transform = src.transform
                height, width = data.shape
                
                print(f"   TIFF bounds: N={src.bounds.top:.6f}, S={src.bounds.bottom:.6f}, E={src.bounds.right:.6f}, W={src.bounds.left:.6f}")
                
                # Search for horizontal sequence
                found_sequences = []
                for row in range(height):
                    for col in range(width - len(target_sequence) + 1):
                        # Check if sequence matches (allowing small floating point differences)
                        sequence_match = True
                        for i, target_val in enumerate(target_sequence):
                            actual_val = data[row, col + i]
                            if not (np.isfinite(actual_val) and abs(actual_val - target_val) < 0.01):
                                sequence_match = False
                                break
                        
                        if sequence_match:
                            # Calculate geographic coordinates for each value in sequence
                            geo_coords = []
                            actual_values = []
                            for i in range(len(target_sequence)):
                                lon, lat = rasterio.transform.xy(transform, row, col + i)
                                geo_coords.append((lat, lon))
                                actual_values.append(data[row, col + i])
                            
                            found_sequences.append({
                                'pixel_start': (col, row),
                                'geo_coords': geo_coords,
                                'values': actual_values
                            })
                
                if len(found_sequences) == 0:
                    print(f"   ❌ Sequence NOT found")
                elif len(found_sequences) == 1:
                    seq = found_sequences[0]
                    print(f"   ✅ Sequence found EXACTLY ONCE at pixel({seq['pixel_start'][0]},{seq['pixel_start'][1]})")
                    print(f"   Values: {[f'{v:.2f}' for v in seq['values']]}")
                    print(f"   Geographic coordinates:")
                    for i, (lat, lon) in enumerate(seq['geo_coords']):
                        print(f"     [{i}] {seq['values'][i]:.2f} at ({lat:.6f}°N, {lon:.6f}°E)")
                    
                    sequence_locations[asset_id] = seq
                else:
                    print(f"   ⚠️  Sequence found {len(found_sequences)} times - not unique!")
                    
        except Exception as e:
            print(f"   ❌ Error reading {filename}: {e}")
    
    # Compare geographic coordinates across assets
    print(f"\n📊 COORDINATE CONSISTENCY CHECK:")
    print("-" * 40)
    
    if len(sequence_locations) >= 2:
        print("Comparing geographic positions of the same sequence across assets:")
        
        for i in range(len(target_sequence)):
            print(f"\nValue {i} ({target_sequence[i]}) geographic positions:")
            positions = []
            
            for asset_id, seq_data in sequence_locations.items():
                if i < len(seq_data['geo_coords']):
                    lat, lon = seq_data['geo_coords'][i]
                    print(f"   {asset_id}: ({lat:.6f}°N, {lon:.6f}°E)")
                    positions.append((lat, lon))
            
            if len(positions) >= 2:
                lats = [pos[0] for pos in positions]
                lons = [pos[1] for pos in positions]
                lat_variance = max(lats) - min(lats)
                lon_variance = max(lons) - min(lons)
                
                # Convert to approximate distances
                lat_km = lat_variance * 111.0  # 1 degree ≈ 111 km
                lon_km = lon_variance * 111.0 * 0.85  # cos(32°) ≈ 0.85
                
                print(f"   📏 Variance: {lat_variance:.6f}° lat ({lat_km:.1f}km), {lon_variance:.6f}° lon ({lon_km:.1f}km)")
                
                if lat_variance < 0.000001 and lon_variance < 0.000001:
                    print(f"   ✅ SAME coordinates - no coordinate system bug")
                else:
                    print(f"   ❌ DIFFERENT coordinates - coordinate system bug CONFIRMED")
        
        print(f"\n🔍 FINAL DIAGNOSIS:")
        if len(sequence_locations) >= 2:
            example_asset = list(sequence_locations.keys())[0]
            other_assets = [k for k in sequence_locations.keys() if k != example_asset]
            
            if other_assets:
                ref_coords = sequence_locations[example_asset]['geo_coords'][0]
                other_coords = sequence_locations[other_assets[0]]['geo_coords'][0]
                
                lat_diff = abs(ref_coords[0] - other_coords[0])
                lon_diff = abs(ref_coords[1] - other_coords[1])
                
                if lat_diff > 0.000001 or lon_diff > 0.000001:
                    print(f"The same population values appear at different geographic coordinates")
                    print(f"across different assets. This indicates the population TIFFs were")
                    print(f"created with inconsistent georeferencing - identical population")
                    print(f"data is positioned at different places on Earth.")
                else:
                    print(f"Population values appear at consistent geographic coordinates")
                    print(f"across assets. The coordinate system is working correctly.")
    else:
        print("Insufficient data for coordinate comparison.")

if __name__ == "__main__":
    analyze_population_offsets()
    analyze_population_value_sequences()