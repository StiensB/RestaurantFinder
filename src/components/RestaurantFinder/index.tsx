/// <reference types="@types/google.maps" />
import React, { useEffect, useLayoutEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader } from "@googlemaps/js-api-loader";
import { MapPin, Star, Search, RotateCw } from "lucide-react";
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

export default function RestaurantFinder() {
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
    <div className="container mx-auto p-8">
      <div className="flex flex-col gap-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-2">Restaurant Finder</h1>
          <p className="text-gray-600">Find the best restaurants near you</p>
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <Input
              ref={searchInputRef}
              placeholder="Search by name or address..."
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="flex-1">
            <Input
              placeholder="Filter by cuisine (e.g., italian, chinese)"
              value={cuisineFilter}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setCuisineFilter(e.target.value);
                // Trigger a new search when cuisine filter changes
                if (mapInstance) {
                  const center = mapInstance.getCenter();
                  if (center) {
                    searchNearby(center, mapInstance);
                  }
                }
              }}
              className="w-full"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-sm">Minimum Rating:</span>
          <Slider
            defaultValue={[minRating]}
            onValueChange={(value) => setMinRating(value[0])}
            min={0}
            max={5}
            step={0.5}
            className="w-48"
          />
          <span className="text-sm font-medium">{minRating} ⭐</span>

          <div className="h-6 w-px bg-gray-200 mx-2" />

          <span className="text-sm">Search Radius:</span>
          <Slider
            defaultValue={[searchRadius]}
            onValueChange={(value) => {
              const meters = value[0];
              setSearchRadius(meters);
              // Trigger a new search with the updated radius
              if (mapInstance) {
                const center = mapInstance.getCenter();
                if (center) {
                  searchNearby(center, mapInstance);
                }
              }
            }}
            min={1609} // 1 mile in meters
            max={40000} // ~25 miles in meters
            step={1609} // 1 mile increments
            className="w-48"
          />
          <span className="text-sm font-medium">{Math.round(searchRadius / 1609)} miles</span>

          <div className="h-6 w-px bg-gray-200 mx-2" />

          <Button
            variant="outline"
            onClick={() => {
              setSearchTerm("");
              setCuisineFilter("");
              setMinRating(0);
              setSearchRadius(24140); // Reset to 15 miles
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
          >
            Clear Filters
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              if (mapInstance) {
                const center = mapInstance.getCenter();
                if (center) {
                  searchNearby(center, mapInstance);
                }
              }
            }}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-8">
        <div className="w-full h-[400px] rounded-lg overflow-hidden shadow-lg">
          <div ref={mapRef} className="w-full h-full" />
        </div>

        {!error && !loading && restaurants.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Top 5 Rated Restaurants Near You</h2>
            <div className="grid gap-4">
              {restaurants.slice(0, 5).map((restaurant) => (
                <div
                  key={restaurant.place_id}
                  className="flex justify-between items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  onClick={() => {
                    const marker = markersRef.current.find(
                      m => m.title === restaurant.name
                    );
                    if (marker && mapInstance) {
                      mapInstance.panTo(restaurant.geometry.location);
                      mapInstance.setZoom(15);
                      
                      // Trigger the marker click
                      google.maps.event.trigger(marker, 'click');
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div>
                    <h3 className="font-bold text-lg">{restaurant.name}</h3>
                    <p className="text-sm text-gray-600 flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {restaurant.vicinity}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {restaurant.types?.slice(0, 3).map((type) => (
                        <span
                          key={type}
                          className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded"
                        >
                          {type.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <Star className="w-5 h-5 text-yellow-400 fill-current" />
                      <span className="font-medium text-lg">{restaurant.rating}</span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {restaurant.user_ratings_total} reviews
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {error ? (
          <div className="text-red-500 text-center p-4">{error}</div>
        ) : loading ? (
          <div className="text-center p-4">Loading restaurants...</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredRestaurants.map((restaurant) => (
              <Card key={restaurant.place_id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-lg mb-2">{restaurant.name}</h3>
                      <p className="text-sm text-gray-600 flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {restaurant.vicinity}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-yellow-400 fill-current" />
                      <span className="font-medium">{restaurant.rating}</span>
                      <span className="text-sm text-gray-500">
                        ({restaurant.user_ratings_total})
                      </span>
                    </div>
                  </div>
                  <div className="mt-3">
                    {restaurant.types?.map((type) => (
                      <span
                        key={type}
                        className="inline-block bg-gray-100 rounded-full px-3 py-1 text-sm mr-2 mb-2"
                      >
                        {type.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
