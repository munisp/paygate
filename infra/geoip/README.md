# GeoLite2-City Database

This directory holds the MaxMind GeoLite2-City MMDB file used by the
`threat-intel` microservice for IP geolocation and velocity checks.

## Populating the database

```bash
# With a MaxMind license key (recommended — most accurate, updated weekly):
MAXMIND_LICENSE_KEY=your_key node scripts/download-geoip.mjs

# Without a key — uses the free DB-IP mirror (updated monthly):
node scripts/download-geoip.mjs
```

The script skips re-download if the existing file is less than 30 days old.

## CI integration

The `.github/workflows/ci.yml` workflow runs `download-geoip.mjs` before
spinning up the `threat-intel` container.  Set `MAXMIND_LICENSE_KEY` as a
GitHub Actions secret to use the MaxMind source; leave it unset to fall back
to the DB-IP mirror.

## Docker mount

`docker-compose.production.yml` mounts this directory into the
`threat-intel` container at `/app/geoip`:

```yaml
volumes:
  - ./infra/geoip:/app/geoip:ro
```

The service reads `GEOIP_DB_PATH=/app/geoip/GeoLite2-City.mmdb`.

## Files

| File | Description |
|---|---|
| `GeoLite2-City.mmdb` | Binary MMDB database (not committed — download via script) |
| `metadata.json` | Download timestamp, source, and SHA-256 checksum |
| `.gitignore` | Excludes the large `.mmdb` binary from git |

## License

GeoLite2 data is provided by MaxMind under the
[Creative Commons Attribution-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-sa/4.0/).
DB-IP data is provided under the
[Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/).
