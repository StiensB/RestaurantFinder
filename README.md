# NearbyBites

A web application to discover and explore restaurants in your area using Google Maps and Places API.

## Environment Setup

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Add your Google Maps API key to `.env`:
```env
VITE_GOOGLE_MAPS_API_KEY=your_api_key_here
```

3. Secure your API key:
- Never commit `.env` file
- Restrict API key in Google Cloud Console:
  - Set HTTP referrer restrictions
  - Limit to your deployment domain
  - Enable only required APIs (Maps JavaScript API, Places API)

## Features

- Interactive map with restaurant markers
- Top 5 rated restaurants display
- Search by name or address with autocomplete
- Filter by cuisine type
- Adjust search radius
- Minimum rating filter
- Real-time updates as you move the map

## Deployment

### Vercel
```bash
vercel env add VITE_GOOGLE_MAPS_API_KEY
vercel deploy
```

### Netlify
1. Go to Site settings > Build & deploy > Environment variables
2. Add `VITE_GOOGLE_MAPS_API_KEY`
3. Deploy as usual

### GitHub Pages
1. Set up repository secrets
2. Enable GitHub Pages
3. Push to main branch for automatic deployment

### Other Platforms
Ensure you:
1. Set `VITE_GOOGLE_MAPS_API_KEY` in your platform's environment variables
2. Restrict the API key to your deployment domain
3. Never expose the API key in client-side code or version control
