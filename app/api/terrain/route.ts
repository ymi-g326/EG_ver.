import { NextRequest, NextResponse } from "next/server";
import { terrainGrid, analyzeElevation } from "@/lib/terrain-data";
export async function GET(request: NextRequest) {
  const lat=request.nextUrl.searchParams.get('lat'),lon=request.nextUrl.searchParams.get('lon');
  const grid=lat?.trim()&&lon?.trim()?terrainGrid(Number(lat),Number(lon)):null;
  if(!grid) return NextResponse.json({error:'INVALID COORDINATES'},{status:400});
  const params=new URLSearchParams({latitude:grid.points.map(p=>p.latitude).join(','),longitude:grid.points.map(p=>p.longitude).join(',')});
  try {
    const response=await fetch('https://api.open-meteo.com/v1/elevation?'+params,{signal:AbortSignal.timeout(8000),next:{revalidate:604800}});
    if(!response.ok) throw Error('Elevation '+response.status);
    const raw=await response.json() as {elevation?:unknown};
    const analyzed=analyzeElevation(raw.elevation);
    if(!analyzed) throw Error('Invalid elevation data');
    return NextResponse.json({...analyzed,latitude:grid.latitude,longitude:grid.longitude,source:'Copernicus DEM GLO-90 / Open-Meteo',fetchedAt:new Date().toISOString()},
      {headers:{'Cache-Control':'public, s-maxage=604800, stale-while-revalidate=86400'}});
  } catch {
    return NextResponse.json({error:'TERRAIN UNAVAILABLE',latitude:grid.latitude,longitude:grid.longitude},{status:502,headers:{'Cache-Control':'no-store'}});
  }
}
