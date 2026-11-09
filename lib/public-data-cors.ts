/** These endpoints expose only public Earth/orbit data, without credentials. */
export function publicDataCors<T extends Response>(response: T): T {
  response.headers.set("Access-Control-Allow-Origin", "*");
  return response;
}
