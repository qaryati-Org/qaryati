# ADR-004: Geocoding Caching Strategy

- **Status:** Accepted
- **Date:** 2026-11-19
- **Deciders:** Yahya, Ahmad, Rashad, Lina

## Context

The Qaryati application uses the Nominatim external API to convert location addresses into geographic coordinates.

Repeated requests for the same address can cause unnecessary external API calls, increase response times, and consume the API's rate limit.

The system therefore needs a caching strategy to reduce repeated requests while keeping the implementation simple and maintainable.

## Decision

We decided to implement an **in-memory cache** using JavaScript's `Map` through a dedicated `GeocodingCacheService`.

The cache follows these rules:

- **Storage:** In-memory `Map`.
- **Time To Live (TTL):** 24 hours.
- **Maximum Entries:** 1,000 entries.
- **Eviction Policy:** FIFO (First In, First Out).
- **Cache Key Normalization:** Addresses are trimmed, consecutive whitespace is collapsed, and the key is converted to lowercase.
- **Successful Results Only:** Only successful geocoding results are cached. `null` results and failed requests are not cached.
- **Expiration:** Expired entries are removed when accessed. Expired entries are also cleaned up before inserting a new entry.
- **Capacity Management:** When the cache reaches its maximum capacity, the oldest entry is removed before inserting a new one. Updating an existing key refreshes its insertion order.

The original trimmed address is sent to Nominatim, while the normalized value is used only as the cache key.

## Alternatives Considered

### 1. No Caching

Every geocoding request would be sent directly to Nominatim.

This option was rejected because it increases unnecessary API calls, response times, and rate-limit consumption.

### 2. In-Memory Cache (Selected)

Store geocoding results in the application's memory using a `Map`.

This option was selected because it is simple, fast, and does not require additional infrastructure.

### 3. Redis

Use Redis as a distributed caching solution.

This option was not selected because the current project does not require a shared cache across multiple application instances. Redis can be considered in the future if the application needs horizontal scaling.

## Consequences

### Positive Consequences

- Reduces repeated requests to the Nominatim API.
- Improves response times for previously requested addresses.
- Helps respect the external API's rate limit.
- Keeps the implementation simple and isolated within a dedicated service.
- Avoids introducing additional infrastructure.

### Negative Consequences and Limitations

- Cached data is lost when the application restarts.
- Each application instance maintains its own independent cache.
- FIFO may remove frequently accessed entries because it does not consider access frequency.
- Concurrent requests for the same uncached address are not deduplicated and may trigger multiple external API calls.

## Implementation

The decision is implemented through the following components:

- `GeocodingCacheService`: Responsible for storing, retrieving, expiring, and evicting cached results.
- `NominatimGeocodingProvider`: Normalizes addresses, checks the cache, calls Nominatim when necessary, and stores successful results.
- `GeocodingModule`: Registers the cache service through NestJS dependency injection.

## Conclusion

The project uses an in-memory caching strategy with a 24-hour TTL and a maximum capacity of 1,000 entries, following FIFO eviction.

This approach satisfies the current requirements while keeping the system simple. A distributed solution such as Redis may be reconsidered if the application requires multiple instances or shared cache storage.