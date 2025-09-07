#!/usr/bin/env python3
"""
Calculate the relative distances between population rasters to understand the coordinate offsets.
"""

import rasterio
import numpy as np
import math

def haversine_distance(lat1, lon1, lat2, lon2):
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees).
    Returns distance in kilometers.
    """
    # Convert decimal degrees to radians
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    
    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    
    # Radius of earth in kilometers
    r = 6371
    
    return c * r

def calculate_bearing(lat1, lon1, lat2, lon2):
    """
    Calculate the bearing between two points.
    Returns bearing in degrees (0-360, where 0=North, 90=East, 180=South, 270=West).
    """
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    
    dlon = lon2 - lon1
    
    y = math.sin(dlon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    
    bearing = math.atan2(y, x)
    
    # Convert to degrees and normalize to 0-360
    bearing = math.degrees(bearing)
    bearing = (bearing + 360) % 360
    
    return bearing

def bearing_to_direction(bearing):
    """Convert bearing to cardinal direction."""
    directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", 
                  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    idx = round(bearing / 22.5) % 16
    return directions[idx]

def analyze_population_positions():
    """Analyze the geographic positioning of the three population rasters."""
    
    assets = [
        ("CHN_1566584", "input_geotiffs/CHN/1566584-pop-v3.tiff"),
        ("CHN_1566601", "input_geotiffs/CHN/1566601-pop-v3.tiff"),  # Reference
        ("CHN_38089178", "input_geotiffs/CHN/38089178-pop-v3.tiff")
    ]
    
    print("📏 POPULATION RASTER COORDINATE OFFSET ANALYSIS")
    print("=" * 60)
    
    # Step 1: Get bounds and centers for each TIFF
    raster_info = {}
    
    for asset_name, tiff_path in assets:
        with rasterio.open(tiff_path) as src:
            bounds = src.bounds
            transform = src.transform
            shape = src.shape
            
            # Calculate center coordinates
            center_lat = (bounds.top + bounds.bottom) / 2
            center_lon = (bounds.left + bounds.right) / 2
            
            # Calculate geographic extent
            width_km = haversine_distance(center_lat, bounds.left, center_lat, bounds.right)
            height_km = haversine_distance(bounds.bottom, center_lon, bounds.top, center_lon)
            
            raster_info[asset_name] = {
                'bounds': bounds,
                'center': (center_lat, center_lon),
                'shape': shape,
                'transform': transform,
                'extent_km': (width_km, height_km)
            }
            
            print(f"\n📍 {asset_name}:")
            print(f"   Bounds: N={bounds.top:.6f}, S={bounds.bottom:.6f}, E={bounds.right:.6f}, W={bounds.left:.6f}")
            print(f"   Center: {center_lat:.6f}°N, {center_lon:.6f}°E")
            print(f"   Geographic extent: {width_km:.1f}km × {height_km:.1f}km")
            print(f"   Pixel dimensions: {shape[1]} × {shape[0]}")
    
    # Step 2: Calculate relative offsets using CHN_1566601 as reference
    reference_name = "CHN_1566601"
    reference_center = raster_info[reference_name]['center']
    
    print(f"\n📏 OFFSET CALCULATIONS (relative to {reference_name}):")
    print("=" * 60)
    print(f"Reference center: {reference_center[0]:.6f}°N, {reference_center[1]:.6f}°E")
    
    for asset_name in raster_info:
        if asset_name == reference_name:
            continue
            
        asset_center = raster_info[asset_name]['center']
        
        # Calculate distance and bearing
        distance_km = haversine_distance(
            reference_center[0], reference_center[1],
            asset_center[0], asset_center[1]
        )
        
        bearing = calculate_bearing(
            reference_center[0], reference_center[1],
            asset_center[0], asset_center[1]
        )
        
        direction = bearing_to_direction(bearing)
        
        # Calculate coordinate offsets
        lat_offset_deg = asset_center[0] - reference_center[0]
        lon_offset_deg = asset_center[1] - reference_center[1]
        
        # Convert to km for easier understanding
        lat_offset_km = haversine_distance(reference_center[0], reference_center[1], 
                                           asset_center[0], reference_center[1])
        lon_offset_km = haversine_distance(reference_center[0], reference_center[1], 
                                           reference_center[0], asset_center[1])
        
        # Handle negative offsets
        if lat_offset_deg < 0:
            lat_offset_km = -lat_offset_km
        if lon_offset_deg < 0:
            lon_offset_km = -lon_offset_km
        
        print(f"\n🎯 {asset_name} offset from reference:")
        print(f"   Distance: {distance_km:.2f} km")
        print(f"   Direction: {direction} (bearing {bearing:.1f}°)")
        print(f"   Coordinate offset: {lat_offset_deg:+.6f}° lat, {lon_offset_deg:+.6f}° lon")
        print(f"   Distance offset: {lat_offset_km:+.2f} km north, {lon_offset_km:+.2f} km east")
        
        # Calculate how many pixels this represents at typical resolution
        typical_pixel_size_deg = 0.003333  # About 300m at this latitude
        lat_offset_pixels = abs(lat_offset_deg) / typical_pixel_size_deg
        lon_offset_pixels = abs(lon_offset_deg) / typical_pixel_size_deg
        
        print(f"   Pixel offset: ~{lat_offset_pixels:.0f} pixels lat, ~{lon_offset_pixels:.0f} pixels lon")
    
    # Step 3: Check if all three cover overlapping areas
    print(f"\n📊 OVERLAP ANALYSIS:")
    print("=" * 60)
    
    # Find overall bounding box that encompasses all three
    all_bounds = list(raster_info.values())
    min_lat = min(b['bounds'].bottom for b in all_bounds)
    max_lat = max(b['bounds'].top for b in all_bounds) 
    min_lon = min(b['bounds'].left for b in all_bounds)
    max_lon = max(b['bounds'].right for b in all_bounds)
    
    print(f"Combined extent: N={max_lat:.6f}, S={min_lat:.6f}, E={max_lon:.6f}, W={min_lon:.6f}")
    
    combined_width_km = haversine_distance((max_lat + min_lat)/2, min_lon, (max_lat + min_lat)/2, max_lon)
    combined_height_km = haversine_distance(min_lat, (max_lon + min_lon)/2, max_lat, (max_lon + min_lon)/2)
    
    print(f"Combined geographic extent: {combined_width_km:.1f}km × {combined_height_km:.1f}km")
    
    # Check pairwise overlaps
    asset_names = list(raster_info.keys())
    for i in range(len(asset_names)):
        for j in range(i + 1, len(asset_names)):
            name1, name2 = asset_names[i], asset_names[j]
            bounds1 = raster_info[name1]['bounds']
            bounds2 = raster_info[name2]['bounds']
            
            # Calculate overlap
            overlap_north = min(bounds1.top, bounds2.top)
            overlap_south = max(bounds1.bottom, bounds2.bottom)
            overlap_east = min(bounds1.right, bounds2.right)
            overlap_west = max(bounds1.left, bounds2.left)
            
            has_overlap = (overlap_north > overlap_south) and (overlap_east > overlap_west)
            
            if has_overlap:
                overlap_width_km = haversine_distance((overlap_north + overlap_south)/2, overlap_west, 
                                                      (overlap_north + overlap_south)/2, overlap_east)
                overlap_height_km = haversine_distance(overlap_south, (overlap_east + overlap_west)/2, 
                                                       overlap_north, (overlap_east + overlap_west)/2)
                
                # Calculate overlap percentage
                area1_km2 = raster_info[name1]['extent_km'][0] * raster_info[name1]['extent_km'][1]
                area2_km2 = raster_info[name2]['extent_km'][0] * raster_info[name2]['extent_km'][1]
                overlap_km2 = overlap_width_km * overlap_height_km
                
                overlap_pct1 = (overlap_km2 / area1_km2) * 100
                overlap_pct2 = (overlap_km2 / area2_km2) * 100
                
                print(f"\n✅ {name1} ↔ {name2}:")
                print(f"   Overlap area: {overlap_width_km:.1f}km × {overlap_height_km:.1f}km = {overlap_km2:.0f} km²")
                print(f"   Overlap percentage: {overlap_pct1:.1f}% of {name1}, {overlap_pct2:.1f}% of {name2}")
            else:
                print(f"\n❌ {name1} ↔ {name2}: NO GEOGRAPHIC OVERLAP")

if __name__ == "__main__":
    analyze_population_positions()