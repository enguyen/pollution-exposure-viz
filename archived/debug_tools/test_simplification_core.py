#!/usr/bin/env python3
"""
Core validation tests for edge trimming removal simplification.
Tests the backend logic and coordinate calculations without requiring browser/DOM.
"""

import json
import rasterio
import numpy as np
import os
from pathlib import Path
from typing import Dict, Tuple, List

class TestSimplificationCore:
    """Test suite for validating edge trimming removal."""
    
    def __init__(self):
        self.test_assets = [
            {"asset_id": "1566584", "country": "CHN"},
            {"asset_id": "1566601", "country": "CHN"}, 
            {"asset_id": "38089178", "country": "CHN"}
        ]
        self.test_sequence = [16.0, 5.42, 5.36]  # Known sequence for coordinate validation
        
    def load_json_data(self, asset_id: str, country: str) -> Dict:
        """Load processed JSON overlay data."""
        json_path = f"overlays/{country}_{asset_id}_data.json"
        if not os.path.exists(json_path):
            json_path = f"prototype_overlays/{country}_{asset_id}_data.json"
            
        with open(json_path, 'r') as f:
            return json.load(f)
    
    def get_tiff_coordinates(self, asset_id: str, country: str, row: int, col: int) -> Tuple[float, float]:
        """Get geographic coordinates from original TIFF file."""
        tiff_path = f"input_geotiffs/{country}/{asset_id}-pop-v3.tiff"
        
        with rasterio.open(tiff_path) as src:
            lon, lat = rasterio.transform.xy(src.transform, row, col)
            return lat, lon
    
    def calculate_json_coordinates_simple(self, json_data: Dict, data_x: int, data_y: int) -> Tuple[float, float]:
        """
        Calculate coordinates using simple method (no edge trimming).
        This mimics the simplified JavaScript coordinate calculation.
        """
        bounds = json_data['bounds']
        width = json_data['dimensions']['width'] 
        height = json_data['dimensions']['height']
        
        pixel_size_x = (bounds['east'] - bounds['west']) / width
        pixel_size_y = (bounds['north'] - bounds['south']) / height
        
        # Calculate geographic position (center of pixel)
        geo_x = bounds['west'] + (data_x + 0.5) * pixel_size_x
        geo_y = bounds['north'] - (data_y + 0.5) * pixel_size_y
        
        return geo_y, geo_x  # lat, lon
    
    def find_sequence_in_data(self, data: List[List[float]], target_sequence: List[float]) -> Dict:
        """Find a horizontal sequence in 2D data array."""
        for row in range(len(data)):
            for col in range(len(data[row]) - len(target_sequence) + 1):
                # Check if sequence matches
                match = True
                for i, target_val in enumerate(target_sequence):
                    actual_val = data[row][col + i]
                    if abs(actual_val - target_val) > 0.01:
                        match = False
                        break
                
                if match:
                    return {
                        'row': row,
                        'col': col,
                        'values': [data[row][col + i] for i in range(len(target_sequence))]
                    }
        return None
    
    def test_coordinate_math_accuracy(self) -> bool:
        """Test that simplified coordinate calculations match TIFF exactly."""
        print("🧮 Testing coordinate calculation accuracy...")
        
        all_passed = True
        
        for asset in self.test_assets:
            asset_id = asset['asset_id']
            country = asset['country']
            
            print(f"  Testing {country}_{asset_id}...")
            
            try:
                # Load JSON data
                json_data = self.load_json_data(asset_id, country)
                
                # Find our test sequence in the JSON data
                sequence_location = self.find_sequence_in_data(
                    json_data['data']['population'], 
                    self.test_sequence
                )
                
                if not sequence_location:
                    print(f"    ❌ Test sequence not found in JSON data")
                    all_passed = False
                    continue
                
                # Test coordinate calculation for each value in sequence
                max_lat_error = 0
                max_lon_error = 0
                
                for i in range(len(self.test_sequence)):
                    # Get coordinates from original TIFF
                    tiff_lat, tiff_lon = self.get_tiff_coordinates(
                        asset_id, country,
                        row=sequence_location['row'],
                        col=sequence_location['col'] + i
                    )
                    
                    # Calculate coordinates using simplified method
                    json_lat, json_lon = self.calculate_json_coordinates_simple(
                        json_data,
                        data_x=sequence_location['col'] + i,
                        data_y=sequence_location['row']
                    )
                    
                    # Calculate errors
                    lat_error = abs(tiff_lat - json_lat)
                    lon_error = abs(tiff_lon - json_lon)
                    
                    max_lat_error = max(max_lat_error, lat_error)
                    max_lon_error = max(max_lon_error, lon_error)
                    
                    print(f"    [{i}] TIFF: ({tiff_lat:.6f}, {tiff_lon:.6f})")
                    print(f"    [{i}] JSON: ({json_lat:.6f}, {json_lon:.6f})")
                    print(f"    [{i}] Error: ({lat_error:.8f}°, {lon_error:.8f}°)")
                
                # Test accuracy (should be within floating point precision)
                lat_error_meters = max_lat_error * 111000  # Rough conversion
                lon_error_meters = max_lon_error * 111000 * 0.85  # cos(32°)
                
                if lat_error_meters < 1.0 and lon_error_meters < 1.0:
                    print(f"    ✅ PASS: Max error {lat_error_meters:.1f}m lat, {lon_error_meters:.1f}m lon")
                else:
                    print(f"    ❌ FAIL: Max error {lat_error_meters:.1f}m lat, {lon_error_meters:.1f}m lon")
                    all_passed = False
                    
            except Exception as e:
                print(f"    ❌ ERROR: {e}")
                all_passed = False
        
        return all_passed
    
    def test_data_structure_integrity(self) -> bool:
        """Test JSON data structure is valid and complete."""
        print("📋 Testing data structure integrity...")
        
        all_passed = True
        
        for asset in self.test_assets:
            asset_id = asset['asset_id']
            country = asset['country']
            
            print(f"  Testing {country}_{asset_id}...")
            
            try:
                json_data = self.load_json_data(asset_id, country)
                
                # Test required structure
                required_fields = ['bounds', 'dimensions', 'data']
                for field in required_fields:
                    if field not in json_data:
                        print(f"    ❌ Missing required field: {field}")
                        all_passed = False
                
                # Test bounds structure
                bounds_fields = ['north', 'south', 'east', 'west']
                for field in bounds_fields:
                    if field not in json_data['bounds']:
                        print(f"    ❌ Missing bounds field: {field}")
                        all_passed = False
                
                # Test dimensions structure
                dim_fields = ['width', 'height']
                for field in dim_fields:
                    if field not in json_data['dimensions']:
                        print(f"    ❌ Missing dimensions field: {field}")
                        all_passed = False
                
                # Test data arrays exist and have correct dimensions
                if 'population' not in json_data['data']:
                    print(f"    ❌ Missing population data")
                    all_passed = False
                else:
                    pop_data = json_data['data']['population']
                    expected_height = json_data['dimensions']['height']
                    expected_width = json_data['dimensions']['width']
                    
                    if len(pop_data) != expected_height:
                        print(f"    ❌ Population height mismatch: {len(pop_data)} vs {expected_height}")
                        all_passed = False
                    elif len(pop_data[0]) != expected_width:
                        print(f"    ❌ Population width mismatch: {len(pop_data[0])} vs {expected_width}")
                        all_passed = False
                    else:
                        print(f"    ✅ Data structure valid: {expected_height}×{expected_width}")
                
            except Exception as e:
                print(f"    ❌ ERROR: {e}")
                all_passed = False
        
        return all_passed
    
    def test_file_size_reasonable(self) -> bool:
        """Test file sizes are within reasonable limits."""
        print("📏 Testing file sizes...")
        
        all_passed = True
        max_size_kb = 6000  # Allow up to 6MB per file (generous limit)
        
        for asset in self.test_assets:
            asset_id = asset['asset_id']
            country = asset['country']
            
            json_path = f"overlays/{country}_{asset_id}_data.json"
            if not os.path.exists(json_path):
                json_path = f"prototype_overlays/{country}_{asset_id}_data.json"
            
            if os.path.exists(json_path):
                file_size_bytes = os.path.getsize(json_path)
                file_size_kb = file_size_bytes / 1024
                
                if file_size_kb <= max_size_kb:
                    print(f"  ✅ {country}_{asset_id}: {file_size_kb:.1f}KB (acceptable)")
                else:
                    print(f"  ❌ {country}_{asset_id}: {file_size_kb:.1f}KB (too large)")
                    all_passed = False
            else:
                print(f"  ❌ {country}_{asset_id}: File not found")
                all_passed = False
        
        return all_passed
    
    def test_bounds_match_tiff_exactly(self) -> bool:
        """Test JSON bounds exactly match original TIFF bounds."""
        print("🗺️  Testing bounds accuracy...")
        
        all_passed = True
        
        for asset in self.test_assets:
            asset_id = asset['asset_id']
            country = asset['country']
            
            print(f"  Testing {country}_{asset_id}...")
            
            try:
                # Get TIFF bounds
                tiff_path = f"input_geotiffs/{country}/{asset_id}-pop-v3.tiff"
                with rasterio.open(tiff_path) as src:
                    tiff_bounds = src.bounds
                
                # Get JSON bounds  
                json_data = self.load_json_data(asset_id, country)
                json_bounds = json_data['bounds']
                
                # Test exact match (within floating point precision)
                tolerance = 1e-6
                bounds_tests = [
                    ('north', tiff_bounds.top, json_bounds['north']),
                    ('south', tiff_bounds.bottom, json_bounds['south']),
                    ('east', tiff_bounds.right, json_bounds['east']),
                    ('west', tiff_bounds.left, json_bounds['west'])
                ]
                
                bounds_match = True
                for name, tiff_val, json_val in bounds_tests:
                    diff = abs(tiff_val - json_val)
                    if diff > tolerance:
                        print(f"    ❌ {name} mismatch: TIFF={tiff_val:.6f}, JSON={json_val:.6f}, diff={diff:.8f}")
                        bounds_match = False
                    else:
                        print(f"    ✅ {name} matches: {tiff_val:.6f}")
                
                if not bounds_match:
                    all_passed = False
                    
            except Exception as e:
                print(f"    ❌ ERROR: {e}")
                all_passed = False
        
        return all_passed
    
    def test_population_data_preservation(self) -> bool:
        """Test that population data values are preserved correctly."""
        print("👥 Testing population data preservation...")
        
        all_passed = True
        
        for asset in self.test_assets:
            asset_id = asset['asset_id']
            country = asset['country']
            
            print(f"  Testing {country}_{asset_id}...")
            
            try:
                # Find test sequence in JSON
                json_data = self.load_json_data(asset_id, country)
                sequence_location = self.find_sequence_in_data(
                    json_data['data']['population'],
                    self.test_sequence
                )
                
                if sequence_location:
                    # Verify values match expected sequence
                    values_match = True
                    for i, expected_val in enumerate(self.test_sequence):
                        actual_val = sequence_location['values'][i]
                        if abs(actual_val - expected_val) > 0.01:
                            print(f"    ❌ Value mismatch at position {i}: expected {expected_val}, got {actual_val}")
                            values_match = False
                    
                    if values_match:
                        print(f"    ✅ Test sequence found and values preserved")
                    else:
                        all_passed = False
                else:
                    print(f"    ❌ Test sequence not found in data")
                    all_passed = False
                    
            except Exception as e:
                print(f"    ❌ ERROR: {e}")
                all_passed = False
        
        return all_passed
    
    def run_all_tests(self) -> bool:
        """Run complete test suite and return overall pass/fail."""
        print("🧪 RUNNING SIMPLIFICATION CORE VALIDATION TESTS")
        print("=" * 60)
        
        tests = [
            ("Coordinate Math Accuracy", self.test_coordinate_math_accuracy),
            ("Data Structure Integrity", self.test_data_structure_integrity),
            ("File Size Reasonable", self.test_file_size_reasonable),
            ("Bounds Match TIFF Exactly", self.test_bounds_match_tiff_exactly),
            ("Population Data Preservation", self.test_population_data_preservation)
        ]
        
        results = []
        
        for test_name, test_func in tests:
            print(f"\n📋 {test_name.upper()}")
            print("-" * 40)
            try:
                passed = test_func()
                results.append((test_name, passed))
            except Exception as e:
                print(f"❌ TEST FAILED WITH EXCEPTION: {e}")
                results.append((test_name, False))
        
        # Summary
        print("\n" + "=" * 60)
        print("🏁 TEST SUMMARY")
        print("=" * 60)
        
        passed_count = 0
        for test_name, passed in results:
            status = "✅ PASS" if passed else "❌ FAIL"
            print(f"{status}: {test_name}")
            if passed:
                passed_count += 1
        
        overall_pass = passed_count == len(results)
        
        print(f"\nOverall: {passed_count}/{len(results)} tests passed")
        
        if overall_pass:
            print("🎉 ALL TESTS PASSED - Ready for simplification!")
        else:
            print("⚠️  SOME TESTS FAILED - Fix issues before simplifying")
        
        return overall_pass

def main():
    """Run the test suite."""
    tester = TestSimplificationCore()
    success = tester.run_all_tests()
    
    if success:
        print("\n💡 NEXT STEPS:")
        print("1. All core logic tests passed")
        print("2. Ready to implement edge trimming removal")
        print("3. After implementation, run visual validation in browser")
        return 0
    else:
        print("\n🔧 REQUIRED ACTIONS:")
        print("1. Fix failing tests before proceeding")
        print("2. Re-run this test suite until all tests pass")
        return 1

if __name__ == "__main__":
    exit(main())