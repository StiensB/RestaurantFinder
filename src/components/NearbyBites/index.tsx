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
import { Slider } from "@/components/ui/slider";

interface Restaurant {
  place_id: string;
  name: string;
  rating?: number;
  user_ratings_total?: number;
  vicinity?: string;
  types?: string[];
  photos?: google.maps.places.PlacePhoto[];
  geometry: { location: google.maps.LatLng };
}

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
    const service = new google.maps.places.PlacesService(map);
    const request: google.maps.places.PlaceSearchRequest = {
      location,
      radius: searchRadius,
      type: "restaurant",
      rankBy: google.maps.places.RankBy.PROMINENCE,
      keyword: cuisineFilter || searchTerm || undefined
    };

    setLoading(true);
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
      } else {
        console.error("Places API error:", status);
        setError("No restaurants found or error fetching data.");
        setRestaurants([]);
        updateMarkers([], map);
      }
      setLoading(false);
    });
  }, [searchTerm, searchRadius, cuisineFilter]);

  // Initialize map center change listener
  useEffect(() => {
    if (mapInstance) {
      const listener = mapInstance.addListener('idle', () => {
        // Clear any existing timeout
        if (searchTimeoutRef.current !== null) {
          window.clearTimeout(searchTimeoutRef.current);
        }

        // Set a new timeout to search after the map stops moving
        searchTimeoutRef.current = window.setTimeout(() => {
          const center = mapInstance.getCenter();
          if (center) {
            searchNearby(center, mapInstance);
          }
        }, 1000); // Wait 1 second after map stops moving before searching
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
                         r.vicinity?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCuisine = !cuisineFilter || 
                          r.types?.some(type => type.includes(cuisineFilter.toLowerCase()));
    const matchesRating = r.rating ? r.rating >= minRating : false;
    return matchesSearch && matchesCuisine && matchesRating;
  });

  return (
    <div className="container mx-auto p-4 md:p-8">
      <div className="flex flex-col gap-6 md:gap-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 to-teal-600 text-transparent bg-clip-text">
            NearbyBites
          </h1>
          <p className="text-gray-600 text-lg">Discover amazing restaurants in your area</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white rounded-xl shadow-sm p-4">
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
                <SelectItem value="0">Any Rating</SelectItem>
                <SelectItem value="1">⭐ 1+</SelectItem>
                <SelectItem value="2">⭐⭐ 2+</SelectItem>
                <SelectItem value="3">⭐⭐⭐ 3+</SelectItem>
                <SelectItem value="4">⭐⭐⭐⭐ 4+</SelectItem>
                <SelectItem value="5">⭐⭐⭐⭐⭐ 5</SelectItem>
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
              variant="outline"
              onClick={() => {
                setSearchTerm("");
                setCuisineFilter("");
                setMinRating(0);
                setSearchRadius(24140);
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
              className="w-full bg-gray-50 border-gray-200 hover:bg-gray-100"
            >
              Clear Filters
            </Button>
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
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-teal-600 text-white hover:from-blue-700 hover:to-teal-700"
            >
              <RotateCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh Results
            </Button>
          </div>
        </div>

        <div className="relative w-full h-[300px] md:h-[400px] rounded-xl overflow-hidden shadow-lg">
          <div ref={mapRef} className="w-full h-full" />
        </div>

        {!error && !loading && restaurants.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="p-4 md:p-6 border-b border-gray-100">
              <h2 className="text-xl md:text-2xl font-semibold text-gray-900">Top Rated Restaurants</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {restaurants.slice(0, 5).map((restaurant) => (
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
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{restaurant.name}</h3>
                    <p className="text-sm text-gray-600 flex items-center gap-1 mb-2">
                      <MapPin className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{restaurant.vicinity}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {restaurant.types?.slice(0, 3).map((type) => (
                        <span
                          key={type}
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {type.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-4 md:mt-0">
                    <div className="flex items-center gap-1">
                      <Star className="w-5 h-5 text-yellow-400 fill-current" />
                      <span className="font-semibold text-lg">{restaurant.rating}</span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {(restaurant.user_ratings_total ?? 0).toLocaleString()} reviews
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-center">
            {error}
          </div>
        ) : loading ? (
          <div className="flex justify-center items-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
