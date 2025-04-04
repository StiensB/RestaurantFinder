
import React, { useEffect, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader } from "@googlemaps/js-api-loader";
import { MapPin, Star } from "lucide-react";

export default function RestaurantFinder() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapInstance, setMapInstance] = useState(null);
  const [filter, setFilter] = useState("");
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    const loader = new Loader({
      apiKey: "YOUR_GOOGLE_MAPS_API_KEY",
      version: "weekly",
      libraries: ["places"]
    });

    loader.load().then(() => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
          const { latitude, longitude } = position.coords;
          const location = new window.google.maps.LatLng(latitude, longitude);

          const map = new window.google.maps.Map(mapRef.current, {
            center: location,
            zoom: 13
          });
          setMapInstance(map);
          setMapLoaded(true);

          const service = new window.google.maps.places.PlacesService(map);

          const request = {
            location,
            radius: 24140, // 15 miles in meters
            type: ["restaurant"]
          };

          service.nearbySearch(request, (results, status) => {
            if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
              const sorted = results.sort((a, b) => (b.rating || 0) - (a.rating || 0));
              setRestaurants(sorted);
              markersRef.current.forEach(marker => marker.setMap(null));
              markersRef.current = sorted.map(place => {
                const marker = new window.google.maps.Marker({
                  position: place.geometry.location,
                  map,
                  title: place.name
                });
                return marker;
              });
            } else {
              setError("No restaurants found or error fetching data.");
            }
            setLoading(false);
          });
        }, () => {
          setError("Geolocation permission denied.");
          setLoading(false);
        });
      } else {
        setError("Geolocation is not supported by this browser.");
        setLoading(false);
      }
    });
  }, []);

  const filteredRestaurants = restaurants.filter(r =>
    r.types?.some(type => type.includes(filter.toLowerCase()))
  );

  if (loading) return <p className="text-center mt-10 text-lg">Loading nearby restaurants...</p>;
  if (error) return <p className="text-red-500 text-center mt-10">{error}</p>;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">🍽️ Top Rated Restaurants Near You</h1>

      <div className="mb-6 flex gap-2 items-center">
        <Input
          placeholder="Filter by cuisine (e.g. chinese, italian, indian)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-grow"
        />
        <Button onClick={() => setFilter("")}>Clear</Button>
      </div>

      <div ref={mapRef} className="w-full h-80 rounded-xl shadow mb-6" />

      <div className="grid gap-4">
        {(filter ? filteredRestaurants : restaurants).map((r) => (
          <Card key={r.place_id} className="shadow-md rounded-2xl">
            <CardContent className="p-4">
              <h2 className="text-xl font-semibold mb-1">{r.name}</h2>
              <div className="flex items-center gap-2 text-sm text-yellow-600 mb-1">
                <Star className="w-4 h-4" /> {r.rating} ({r.user_ratings_total} reviews)
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <MapPin className="w-4 h-4" /> {r.vicinity}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="text-center text-xs text-gray-500 mt-2">
        This app uses data from Google Maps. © Google
      </div>
    </div>
  );
}
