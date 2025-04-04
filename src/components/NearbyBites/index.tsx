/// <reference types="@types/google.maps" />
import React, { useEffect, useLayoutEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader } from "@googlemaps/js-api-loader";
import { MapPin, Star, Search, RotateCw } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Restaurant = {
  place_id: string;
  name: string;
  rating?: number;
  user_ratings_total?: number;
  vicinity?: string;
  types?: string[];
  photos?: google.maps.places.PlacePhoto[];
  geometry: {
    location: google.maps.LatLng;
  };
};

export default function NearbyBites() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [cuisineFilter, setCuisineFilter] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [searchRadius, setSearchRadius] = useState(24140); // Default to 15 miles in meters
  const mapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const searchTimeoutRef = useRef<number | null>(null);
  const isUpdatingRef = useRef(false);

  const updateMarkers = (restaurants: Restaurant[], map: google.maps.Map) => {
    // Clear existing markers
    markersRef.current.forEach(marker => marker.map = null);
    markersRef.current = [];

    // Create new markers
    restaurants.forEach(restaurant => {
      const pin = new google.maps.marker.PinElement({
        scale: 1,
        background: '#4285F4',
        glyphColor: '#ffffff',
        borderColor: '#ffffff',
      });

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: restaurant.geometry.location,
        title: restaurant.name,
        content: pin.element
      });

      // Add click listener
      marker.addListener('click', () => {
        const content = `
          <div class="p-4">
            <h3 class="font-bold text-lg">${restaurant.name}</h3>
            <p class="text-sm text-gray-600">${restaurant.vicinity || ''}</p>
            <p class="mt-2">
              <span class="text-yellow-500">★</span>
              <span class="font-medium">${restaurant.rating || 'N/A'}</span>
              <span class="text-sm text-gray-500">(${restaurant.user_ratings_total || 0} reviews)</span>
            </p>
          </div>
        `;

        const infowindow = new google.maps.InfoWindow({
          content,
          ariaLabel: restaurant.name,
        });

        infowindow.open({
          anchor: marker,
          map,
        });
      });

      markersRef.current.push(marker);
    });
  };

  const searchNearby = useCallback((location: google.maps.LatLng, map: google.maps.Map) => {
    if (isUpdatingRef.current) {
      return; // Skip if we're already updating
    }

    isUpdatingRef.current = true;
    const service = new google.maps.places.PlacesService(map);
    
    console.log("Searching with radius:", searchRadius); // Debug log
    
    const request: google.maps.places.PlaceSearchRequest = {
      location,
      radius: searchRadius,
      type: "restaurant",
      rankBy: google.maps.places.RankBy.PROMINENCE,
      keyword: cuisineFilter || searchTerm || undefined
    };

    setLoading(true);
    setError(null);

    service.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        const sorted = results
          .filter(place => place.rating && place.rating >= 3.5)
          .sort((a, b) => (b.rating || 0) - (a.rating || 0));

        const mappedResults = sorted.map(place => ({
          place_id: place.place_id!,
          name: place.name!,
          rating: place.rating,
          user_ratings_total: place.user_ratings_total,
          vicinity: place.vicinity,
          types: place.types,
          photos: place.photos,
          geometry: { location: place.geometry!.location! }
        }));

        setRestaurants(mappedResults);
        updateMarkers(mappedResults, map);

        // Only update bounds if we have results
        if (mappedResults.length > 0) {
          const bounds = new google.maps.LatLngBounds();
          bounds.extend(location); // Include search center
          mappedResults.forEach(restaurant => {
            bounds.extend(restaurant.geometry.location);
          });
          map.fitBounds(bounds, 50);
        }
      } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
        setError("No restaurants found in this area. Try adjusting your filters or search radius.");
        setRestaurants([]);
        updateMarkers([], map);
      } else {
        console.error("Places API error:", status);
        setError("Error fetching restaurants. Please try again.");
        setRestaurants([]);
        updateMarkers([], map);
      }
      setLoading(false);
      
      // Reset the updating flag after a short delay
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 1000);
    });
  }, [searchTerm, searchRadius, cuisineFilter, updateMarkers]);

  // Initialize map center change listener
  useEffect(() => {
    if (mapInstance) {
      const listener = mapInstance.addListener('idle', () => {
        // Clear any existing timeout
        if (searchTimeoutRef.current !== null) {
          window.clearTimeout(searchTimeoutRef.current);
        }

        // Only search if we're not currently updating
        if (!isUpdatingRef.current) {
          // Set a new timeout to search after the map stops moving
          searchTimeoutRef.current = window.setTimeout(() => {
            const center = mapInstance.getCenter();
            if (center) {
              searchNearby(center, mapInstance);
            }
          }, 1000); // Wait 1 second after map stops moving before searching
        }
      });

      return () => {
        google.maps.event.removeListener(listener);
        if (searchTimeoutRef.current !== null) {
          window.clearTimeout(searchTimeoutRef.current);
        }
      };
    }
  }, [mapInstance, searchNearby]);

  // Initialize autocomplete
  useEffect(() => {
    if (mapLoaded && searchInputRef.current && !autocompleteRef.current) {
      const autocomplete = new google.maps.places.Autocomplete(searchInputRef.current, {
        types: ['establishment', 'geocode'],
        fields: ['formatted_address', 'geometry', 'name', 'place_id'],
      });

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        
        if (place.geometry && place.geometry.location && mapInstance) {
          // Update map view
          mapInstance.panTo(place.geometry.location);
          mapInstance.setZoom(15);

          // Update search term
          setSearchTerm(place.name || '');

          // Search for restaurants near the selected place
          searchNearby(place.geometry.location, mapInstance);
        }
      });

      autocompleteRef.current = autocomplete;
    }
  }, [mapLoaded, mapInstance, searchNearby]);

  useLayoutEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      setError("Google Maps API key is missing. Please check your environment variables.");
      setLoading(false);
      return;
    }

    if (!mapRef.current) {
      setError("Map container not found.");
      setLoading(false);
      return;
    }

    const loader = new Loader({
      apiKey,
      version: "weekly",
      libraries: ["places", "marker"]
    });

    loader.load().then(() => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            const location = new google.maps.LatLng(latitude, longitude);

            const map = new google.maps.Map(mapRef.current!, {
              center: location,
              zoom: 14,
              mapId: "restaurant_finder_map"
            });

            // Add marker for user's location
            const userLocationPin = new google.maps.marker.PinElement({
              scale: 1.2,
              background: '#4285F4',
              glyphColor: '#ffffff',
              borderColor: '#ffffff',
              glyph: '★',
            });

            new google.maps.marker.AdvancedMarkerElement({
              map,
              position: location,
              title: "Your Location",
              content: userLocationPin.element
            });

            setMapInstance(map);
            setMapLoaded(true);

            const service = new google.maps.places.PlacesService(map);

            try {
              const request: google.maps.places.PlaceSearchRequest = {
                location,
                radius: searchRadius,
                type: "restaurant",
                rankBy: google.maps.places.RankBy.PROMINENCE,
                keyword: searchTerm || undefined
              };

              service.nearbySearch(
                request,
                (
                  results: google.maps.places.PlaceResult[] | null,
                  status: google.maps.places.PlacesServiceStatus
                ) => {
                  if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                    const sorted = results
                      .filter(place => place.rating && place.rating >= 3.5)
                      .sort((a, b) => (b.rating || 0) - (a.rating || 0));

                    const mappedResults = sorted.map(place => ({
                      place_id: place.place_id!,
                      name: place.name!,
                      rating: place.rating,
                      user_ratings_total: place.user_ratings_total,
                      vicinity: place.vicinity,
                      types: place.types,
                      photos: place.photos,
                      geometry: { location: place.geometry!.location! }
                    }));

                    setRestaurants(mappedResults);
                    updateMarkers(mappedResults, map);

                    // Create bounds that include all restaurants and the center
                    const bounds = new google.maps.LatLngBounds(location);
                    mappedResults.forEach(restaurant => {
                      bounds.extend(restaurant.geometry.location);
                    });

                    // Add a bit of padding to the bounds
                    map.fitBounds(bounds, 50);
                  } else {
                    console.error("Places API error:", status);
                    setError("No restaurants found or error fetching data.");
                  }
                  setLoading(false);
                }
              );
            } catch (err) {
              console.error("Places API error:", err);
              setError("Error fetching restaurants. Please try again.");
              setLoading(false);
            }
          },
          () => {
            setError("Geolocation permission denied. Please enable location services.");
            setLoading(false);
          }
        );
      } else {
        setError("Geolocation is not supported by this browser.");
        setLoading(false);
      }
    }).catch((err: Error) => {
      setError("Failed to load Google Maps. Please try again later.");
      setLoading(false);
    });
  }, []);

  const filteredRestaurants = restaurants.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.vicinity && r.vicinity.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCuisine = !cuisineFilter || (r.types && r.types.some(t => t.toLowerCase().includes(cuisineFilter.toLowerCase())));
    const matchesRating = r.rating !== undefined && r.rating >= minRating;
    return matchesSearch && matchesCuisine && matchesRating;
  });

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">NearbyBites</h1>
          <p className="text-lg text-gray-600">Find the best restaurants near you</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Location or Restaurant</label>
            <Input
              ref={searchInputRef}
              placeholder="Search by name or address..."
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Cuisine Type</label>
            <Input
              placeholder="e.g., italian, chinese, mexican..."
              value={cuisineFilter}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setCuisineFilter(e.target.value);
                if (mapInstance) {
                  const center = mapInstance.getCenter();
                  if (center) {
                    searchNearby(center, mapInstance);
                  }
                }
              }}
              className="w-full bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-white rounded-xl shadow-sm p-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Minimum Rating</label>
            <Select
              value={minRating.toString()}
              onValueChange={(value: string) => setMinRating(Number(value))}
            >
              <SelectTrigger className="w-full bg-gray-50 border-gray-200">
                <SelectValue placeholder="Select rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Any rating</SelectItem>
                <SelectItem value="3">3+ stars</SelectItem>
                <SelectItem value="4">4+ stars</SelectItem>
                <SelectItem value="4.5">4.5+ stars</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Search Radius</label>
            <Select
              value={searchRadius.toString()}
              onValueChange={(value: string) => {
                const meters = Number(value);
                setSearchRadius(meters);
                if (mapInstance) {
                  const center = mapInstance.getCenter();
                  if (center) {
                    // Create a circle to visualize the radius
                    const circle = new google.maps.Circle({
                      strokeColor: "#4285F4",
                      strokeOpacity: 0.8,
                      strokeWeight: 2,
                      fillColor: "#4285F4",
                      fillOpacity: 0.1,
                      map: mapInstance,
                      center: center,
                      radius: meters
                    });

                    // Fit the map to the circle bounds
                    mapInstance.fitBounds(circle.getBounds()!);

                    // Remove the circle after a short delay
                    setTimeout(() => {
                      circle.setMap(null);
                    }, 2000);

                    searchNearby(center, mapInstance);
                  }
                }
              }}
            >
              <SelectTrigger className="w-full bg-gray-50 border-gray-200">
                <SelectValue placeholder="Select distance" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1609">1 mile</SelectItem>
                <SelectItem value="4827">3 miles</SelectItem>
                <SelectItem value="8045">5 miles</SelectItem>
                <SelectItem value="16090">10 miles</SelectItem>
                <SelectItem value="24140">15 miles</SelectItem>
                <SelectItem value="40000">25 miles</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button
              onClick={() => {
                if (mapInstance) {
                  const center = mapInstance.getCenter();
                  if (center) {
                    searchNearby(center, mapInstance);
                  }
                }
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Search className="w-4 h-4 mr-2" />
              Search
            </Button>
          </div>

          <div className="flex items-end">
            <Button
              onClick={() => {
                setSearchTerm("");
                setCuisineFilter("");
                setMinRating(0);
                if (searchInputRef.current) {
                  searchInputRef.current.value = "";
                }
                if (mapInstance) {
                  const center = mapInstance.getCenter();
                  if (center) {
                    searchNearby(center, mapInstance);
                  }
                }
              }}
              variant="outline"
              className="w-full border-gray-200 hover:bg-gray-50"
            >
              <RotateCw className="w-4 h-4 mr-2" />
              Reset Filters
            </Button>
          </div>
        </div>

        <div className="mt-8">
          <div ref={mapRef} className="w-full h-[400px] rounded-xl shadow-lg mb-8" />

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-8">
              {error}
            </div>
          )}

          {!error && !loading && restaurants.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="p-4 md:p-6 border-b border-gray-100">
                <h2 className="text-xl md:text-2xl font-semibold text-gray-900">Top Rated Restaurants</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {restaurants.slice(0, 15).map((restaurant) => (
                  <div
                    key={restaurant.place_id}
                    className="flex flex-col md:flex-row justify-between p-4 md:p-6 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => {
                      const marker = markersRef.current.find(
                        m => m.title === restaurant.name
                      );
                      if (marker && mapInstance) {
                        mapInstance.panTo(restaurant.geometry.location);
                        mapInstance.setZoom(15);
                        google.maps.event.trigger(marker, 'click');
                      }
                    }}
                  >
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        {restaurant.name}
                      </h3>
                      <p className="text-gray-600 mb-2">{restaurant.vicinity}</p>
                      <div className="flex items-center gap-2">
                        {restaurant.types?.slice(0, 3).map((type, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            {type.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center mt-4 md:mt-0 md:ml-6">
                      <div className="flex items-center">
                        <Star className="w-5 h-5 text-yellow-400 mr-1" />
                        <span className="font-semibold">{restaurant.rating}</span>
                        <span className="text-gray-500 ml-1">
                          ({restaurant.user_ratings_total} reviews)
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!error && !loading && restaurants.length === 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
              <p className="text-gray-600">No restaurants found matching your criteria.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
