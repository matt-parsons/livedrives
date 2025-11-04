import { fetchPlaceDetails } from '@/lib/googlePlaces';
import { buildOptimizationRoadmap } from '@/app/dashboard/[business]/optimization';

export async function loadOptimizationData(placeId, { signal } = {}) {
  if (!placeId) {
    throw new Error('Place ID is required to load optimization data.');
  }

  const { place } = await fetchPlaceDetails(placeId, { signal });
  const roadmap = buildOptimizationRoadmap(place);

  return { place, roadmap };
}
