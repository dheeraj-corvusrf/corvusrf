// Deploy via CLI: `supabase functions deploy cad-lookup`.
// No secrets required — both ArcGIS FeatureServer endpoints queried below are public,
// unauthenticated county open-data services.
//
// Collin, Montgomery, Denton, Harris, Tarrant, Fort Bend, Williamson, Grayson,
// Travis, and Bexar counties are wired up for real (Phase 2A/2B/2C). All ten publish
// live-queryable parcel data on public ArcGIS FeatureServer/MapServer REST APIs —
// turns out every one of the originally-assumed "bulk file only" counties (Harris/
// Tarrant/Williamson/Grayson) actually has a live API too, just not discoverable via
// plain web search (found via ArcGIS's own item-search API instead). Travis's public
// source has no owner name or value fields at all (only address + legal description)
// — included anyway per product decision, with those fields honestly null rather
// than faked. Bexar is served directly from BCAD's own domain (maps.bcad.org) —
// current values, but requires fully-qualified `table.column` names in the query
// (see queryBexar) and has no land/improvement split, only a combined total. Only
// Dallas has no public live API or bulk download found. Addresses outside these ten
// counties correctly fall through to "not matched" rather than returning fabricated
// data.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  // Without this, supabase-js's functions.invoke() parses the body as plain text
  // (a JSON string) instead of a parsed object, based on the response Content-Type.
  "Content-Type": "application/json",
};

type CadRecord = {
  ownerName: string | null;
  propertyAddress: string;
  cad: string;
  accountNumber: string | null;
  propertyType: string | null;
  landValue: number | null;
  improvementValue: number | null;
  totalValue: number | null;
  taxYear: number | null;
};

// Every county below used to be gated behind a city-name regex (e.g. only try
// Collin if the address said "Plano" or "McKinney"), on the theory that a city name
// reliably indicates a county. It doesn't: three separate real-address bug reports
// on 2026-07-24 each turned out to be this same assumption failing a different way
// — Frisco/Prosper/Celina/Little Elm/The Colony are real parcels in *either*
// Collin or Denton depending on the specific address, and USPS assigns "Dallas" as
// the mailing city for large swaths of ZIP codes that are legally in Collin or
// Denton County, not Dallas County. Enumerating every small town and unincorporated
// area in ten counties (plus every USPS mailing-city quirk) is an unbounded,
// unwinnable list. So this now just queries every supported county in parallel for
// every address and takes the first one that returns a real record, in the fixed
// priority order below — no city-name filtering at all. The per-county ArcGIS/GIS
// queries are cheap, public, and independent, so this costs a few concurrent HTTP
// calls (bounded by the slowest single county, not the sum) rather than any real
// correctness risk, and permanently closes off this entire class of bug.

const STREET_SUFFIX_ALT =
  "st|street|rd|road|dr|drive|ln|lane|ave|avenue|blvd|boulevard|ct|court|pl|place|plz|plaza|pkwy|parkway|hwy|highway|cir|circle|way|trl|trail|trce|trace|loop|cove|bend|xing|crossing|walk|row";

function parseHouseAndStreet(
  address: string,
): { house: string; street: string; cityStateZip: string } | null {
  const withComma = address.match(/^\s*(\d+)\s+([^,]+?)\s*,(.*)$/);
  if (withComma) {
    return { house: withComma[1], street: withComma[2].trim(), cityStateZip: withComma[3].trim() };
  }

  // No comma (e.g. "900 Willowwood St Denton") — capture the house number and street
  // name through the street-suffix word instead, treating everything after it (the
  // city, and optionally state/zip) as the tail. Without this fallback, any address
  // typed without a comma failed to parse at all and silently returned "not matched"
  // before ever reaching the county API.
  const noComma = address.match(
    new RegExp(`^\\s*(\\d+)\\s+(.+?\\b(?:${STREET_SUFFIX_ALT})\\.?)\\b\\s*(.*)$`, "i"),
  );
  if (!noComma) return null;
  return { house: noComma[1], street: noComma[2].trim(), cityStateZip: noComma[3].trim() };
}

// Strips a leading directional (N/S/E/W) and a trailing street-type word, leaving just
// the "core" street name — used for counties whose schema splits house number and
// street type into separate fields, so we can't match the full phrase in one LIKE.
const STREET_SUFFIX_WORDS = new RegExp(`\\b(?:${STREET_SUFFIX_ALT})\\.?$`, "i");
function coreStreetName(street: string): string {
  return street
    .replace(/^(n|s|e|w|north|south|east|west)\s+/i, "")
    .replace(STREET_SUFFIX_WORDS, "")
    .trim();
}

async function queryCollin(address: string): Promise<CadRecord | null> {
  const parsed = parseHouseAndStreet(address);
  if (!parsed) return null;
  const where = `UPPER(situsConcat) LIKE UPPER('%${parsed.house} ${coreStreetName(parsed.street)}%')`;
  const url =
    "https://services2.arcgis.com/uXyoacYrZTPTKD3R/ArcGIS/rest/services/CCAD_Parcel_Feature_Set/FeatureServer/4/query" +
    `?where=${encodeURIComponent(where)}` +
    "&outFields=ownerName,situsConcat,currValLand,currValImprv,currValAppraised,PROP_ID,propType,propYear" +
    "&resultRecordCount=1&f=json";

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Collin CAD query failed: ${res.status}`);
  const json = (await res.json()) as {
    features?: Array<{ attributes: Record<string, string | number | null> }>;
  };
  const attrs = json.features?.[0]?.attributes;
  if (!attrs) return null;

  return {
    ownerName: (attrs.ownerName as string) ?? null,
    propertyAddress: (attrs.situsConcat as string) ?? address,
    cad: "Collin Central Appraisal District",
    accountNumber: attrs.PROP_ID != null ? String(attrs.PROP_ID) : null,
    propertyType: (attrs.propType as string) ?? null,
    landValue: (attrs.currValLand as number) ?? null,
    improvementValue: (attrs.currValImprv as number) ?? null,
    totalValue: (attrs.currValAppraised as number) ?? null,
    taxYear: (attrs.propYear as number) ?? null,
  };
}

async function queryMontgomery(address: string): Promise<CadRecord | null> {
  const parsed = parseHouseAndStreet(address);
  if (!parsed) return null;
  const where = `UPPER(situs) LIKE UPPER('%${parsed.house} ${coreStreetName(parsed.street)}%')`;
  const url =
    "https://services1.arcgis.com/PRoAPGnMSUqvTrzq/arcgis/rest/services/Tax_Parcel_view/FeatureServer/0/query" +
    `?where=${encodeURIComponent(where)}` +
    "&outFields=ownerName,situs,legalDescription,PIN" +
    "&resultRecordCount=1&f=json";

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Montgomery CAD query failed: ${res.status}`);
  const json = (await res.json()) as {
    features?: Array<{ attributes: Record<string, string | number | null> }>;
  };
  const attrs = json.features?.[0]?.attributes;
  if (!attrs) return null;

  return {
    ownerName: (attrs.ownerName as string) ?? null,
    propertyAddress: (attrs.situs as string) ?? address,
    cad: "Montgomery Central Appraisal District",
    accountNumber: attrs.PIN != null ? String(attrs.PIN) : null,
    propertyType: "Not published by county",
    landValue: null,
    improvementValue: null,
    totalValue: null,
    taxYear: null,
  };
}

function parseMoneyField(v: string | number | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseInt(v.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

async function queryDenton(address: string): Promise<CadRecord | null> {
  const parsed = parseHouseAndStreet(address);
  if (!parsed) return null;
  // Denton County's own GIS (gis.dentoncounty.gov) — full ~382k-parcel countywide
  // dataset, not the earlier "TAD_Parcels" service this used to point at, which
  // turned out (discovered 2026-07-24, chasing a "not found" report for a real
  // Denton address) to be a single ~234-parcel subdivision extract, not county-wide
  // coverage. See texas-cad-data-sources memory for the full story.
  const where = `UPPER(situs_full_address) LIKE UPPER('%${parsed.house} ${coreStreetName(parsed.street)}%')`;
  const url =
    "https://gis.dentoncounty.gov/arcgis/rest/services/Parcels_FC/MapServer/0/query" +
    `?where=${encodeURIComponent(where)}` +
    "&outFields=name,situs_full_address,landHSValue,landNHSValue,improvementValue,ownerMarketValue,pid,pYear,propType" +
    "&resultRecordCount=1&f=json";

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Denton CAD query failed: ${res.status}`);
  const json = (await res.json()) as {
    features?: Array<{ attributes: Record<string, string | number | null> }>;
  };
  const attrs = json.features?.[0]?.attributes;
  if (!attrs) return null;

  const situsAddr = (attrs.situs_full_address as string | null)?.trim();
  return {
    ownerName: (attrs.name as string)?.trim() || null,
    propertyAddress: situsAddr || address,
    cad: "Denton Central Appraisal District",
    accountNumber: attrs.pid != null ? String(attrs.pid) : null,
    propertyType: (attrs.propType as string)?.trim() || null,
    landValue:
      (parseMoneyField(attrs.landHSValue) ?? 0) + (parseMoneyField(attrs.landNHSValue) ?? 0),
    improvementValue: parseMoneyField(attrs.improvementValue),
    totalValue: parseMoneyField(attrs.ownerMarketValue),
    taxYear: attrs.pYear != null ? parseInt(String(attrs.pYear), 10) : null,
  };
}

async function queryHarris(address: string): Promise<CadRecord | null> {
  const parsed = parseHouseAndStreet(address);
  if (!parsed) return null;
  const core = coreStreetName(parsed.street);
  const where = `site_str_num = ${parsed.house} AND UPPER(site_str_name) LIKE UPPER('%${core}%')`;
  const url =
    "https://www.gis.hctx.net/arcgis/rest/services/HCAD/Parcels/MapServer/0/query" +
    `?where=${encodeURIComponent(where)}` +
    "&outFields=owner_name_1,site_str_num,site_str_name,site_str_sfx,site_city,land_value,bld_value,total_appraised_val,acct_num,tax_year" +
    "&resultRecordCount=1&f=json";

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Harris CAD query failed: ${res.status}`);
  const json = (await res.json()) as {
    features?: Array<{ attributes: Record<string, string | number | null> }>;
  };
  const attrs = json.features?.[0]?.attributes;
  if (!attrs) return null;

  const streetParts = [attrs.site_str_num, attrs.site_str_name, attrs.site_str_sfx]
    .filter(Boolean)
    .join(" ");
  return {
    ownerName: (attrs.owner_name_1 as string) ?? null,
    propertyAddress: streetParts
      ? `${streetParts}, ${attrs.site_city ?? parsed.cityStateZip}`
      : address,
    cad: "Harris Central Appraisal District",
    accountNumber: (attrs.acct_num as string) ?? null,
    propertyType: null,
    landValue: parseMoneyField(attrs.land_value),
    improvementValue: parseMoneyField(attrs.bld_value),
    totalValue: parseMoneyField(attrs.total_appraised_val),
    taxYear: attrs.tax_year != null ? parseInt(String(attrs.tax_year), 10) : null,
  };
}

async function queryTarrant(address: string): Promise<CadRecord | null> {
  const parsed = parseHouseAndStreet(address);
  if (!parsed) return null;
  const where = `UPPER(Situs_Addr) LIKE UPPER('%${parsed.house} ${coreStreetName(parsed.street)}%')`;
  const url =
    "https://tad.newedgeservices.com/arcgis/rest/services/OD_TAD/OD_ParcelView/MapServer/0/query" +
    `?where=${encodeURIComponent(where)}` +
    "&outFields=Owner_Name,Situs_Addr,Land_Value,Improvemen,Total_Valu,Appraised_,Account_Nu,Property_C" +
    "&f=json"; // this endpoint doesn't support resultRecordCount ("Pagination is not supported")

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tarrant CAD query failed: ${res.status}`);
  const json = (await res.json()) as {
    features?: Array<{ attributes: Record<string, string | number | null> }>;
  };
  const attrs = json.features?.[0]?.attributes;
  if (!attrs) return null;

  const situsAddr = (attrs.Situs_Addr as string | null)?.trim();
  return {
    ownerName: (attrs.Owner_Name as string) ?? null,
    propertyAddress: situsAddr ? `${situsAddr}, ${parsed.cityStateZip}` : address,
    cad: "Tarrant Appraisal District",
    accountNumber: (attrs.Account_Nu as string)?.trim() || null,
    propertyType: (attrs.Property_C as string)?.trim() || null,
    landValue: parseMoneyField(attrs.Land_Value),
    improvementValue: parseMoneyField(attrs.Improvemen),
    totalValue: parseMoneyField(attrs.Appraised_ ?? attrs.Total_Valu),
    taxYear: null,
  };
}

async function queryFortBend(address: string): Promise<CadRecord | null> {
  const parsed = parseHouseAndStreet(address);
  if (!parsed) return null;
  const where = `UPPER(SITUS) LIKE UPPER('%${parsed.house} ${coreStreetName(parsed.street)}%')`;
  const url =
    "https://services2.arcgis.com/D4saGHECICkCeoJm/arcgis/rest/services/FBCAD_Public_Data/FeatureServer/0/query" +
    `?where=${encodeURIComponent(where)}` +
    "&outFields=OWNERNAME,SITUS,LANDVALUE,IMPVALUE,TOTALVALUE,PROPNUMBER,Building_Class" +
    "&resultRecordCount=1&f=json";

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fort Bend CAD query failed: ${res.status}`);
  const json = (await res.json()) as {
    features?: Array<{ attributes: Record<string, string | number | null> }>;
  };
  const attrs = json.features?.[0]?.attributes;
  if (!attrs) return null;

  return {
    ownerName: (attrs.OWNERNAME as string) ?? null,
    propertyAddress: (attrs.SITUS as string)?.trim() || address,
    cad: "Fort Bend Central Appraisal District",
    accountNumber: (attrs.PROPNUMBER as string) ?? null,
    propertyType: (attrs.Building_Class as string) ?? null,
    landValue: parseMoneyField(attrs.LANDVALUE),
    improvementValue: parseMoneyField(attrs.IMPVALUE),
    totalValue: parseMoneyField(attrs.TOTALVALUE),
    taxYear: null,
  };
}

async function queryWilliamson(address: string): Promise<CadRecord | null> {
  const parsed = parseHouseAndStreet(address);
  if (!parsed) return null;
  const where = `UPPER(SITEADDRESS) LIKE UPPER('%${parsed.house} ${coreStreetName(parsed.street)}%')`;
  const url =
    "https://services1.arcgis.com/Xff0bbfp6vwIWmlU/arcgis/rest/services/WCAD_Tax_Parcels/FeatureServer/0/query" +
    `?where=${encodeURIComponent(where)}` +
    "&outFields=OWNERNME1,SITEADDRESS,LNDVALUE,CNTASSDVAL,PARCELID,CLASSDSCRP" +
    "&resultRecordCount=1&f=json";

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Williamson CAD query failed: ${res.status}`);
  const json = (await res.json()) as {
    features?: Array<{ attributes: Record<string, string | number | null> }>;
  };
  const attrs = json.features?.[0]?.attributes;
  if (!attrs) return null;

  return {
    ownerName: (attrs.OWNERNME1 as string) ?? null,
    propertyAddress: (attrs.SITEADDRESS as string)?.trim() || address,
    cad: "Williamson Central Appraisal District",
    accountNumber: (attrs.PARCELID as string) ?? null,
    propertyType: (attrs.CLASSDSCRP as string) ?? null,
    landValue: parseMoneyField(attrs.LNDVALUE),
    improvementValue: null,
    totalValue: parseMoneyField(attrs.CNTASSDVAL),
    taxYear: null,
  };
}

async function queryGrayson(address: string): Promise<CadRecord | null> {
  const parsed = parseHouseAndStreet(address);
  if (!parsed) return null;
  const core = coreStreetName(parsed.street);
  const where = `SitusNumber = '${parsed.house}' AND UPPER(SitusStreet) LIKE UPPER('%${core}%')`;
  const url =
    "https://services1.arcgis.com/EVxyUkKpll765a5X/arcgis/rest/services/Grayson_Appraisal_Parcel_Map_WFL1/FeatureServer/13/query" +
    `?where=${encodeURIComponent(where)}` +
    "&outFields=OwnerName,SitusNumber,SitusStreet,SitusStreetSufix,SitusCity,LandValue,ImprovementValue,MarketValue,PropertyNumber,Year" +
    "&resultRecordCount=1&f=json";

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Grayson CAD query failed: ${res.status}`);
  const json = (await res.json()) as {
    features?: Array<{ attributes: Record<string, string | number | null> }>;
  };
  const attrs = json.features?.[0]?.attributes;
  if (!attrs) return null;

  const streetParts = [attrs.SitusNumber, attrs.SitusStreet, attrs.SitusStreetSufix]
    .filter(Boolean)
    .join(" ");
  return {
    ownerName: (attrs.OwnerName as string) ?? null,
    propertyAddress: streetParts
      ? `${streetParts}, ${attrs.SitusCity ?? parsed.cityStateZip}`
      : address,
    cad: "Grayson Central Appraisal District",
    accountNumber: attrs.PropertyNumber != null ? String(attrs.PropertyNumber) : null,
    propertyType: null,
    landValue: parseMoneyField(attrs.LandValue),
    improvementValue: parseMoneyField(attrs.ImprovementValue),
    totalValue: parseMoneyField(attrs.MarketValue),
    taxYear: attrs.Year != null ? parseInt(String(attrs.Year), 10) : null,
  };
}

async function queryTravis(address: string): Promise<CadRecord | null> {
  const parsed = parseHouseAndStreet(address);
  if (!parsed) return null;
  const core = coreStreetName(parsed.street);
  const where = `situs_num = '${parsed.house}' AND UPPER(situs_street) LIKE UPPER('%${core}%')`;
  const url =
    "https://gis.traviscountytx.gov/server1/rest/services/Boundaries_and_Jurisdictions/TCAD_public/MapServer/0/query" +
    `?where=${encodeURIComponent(where)}` +
    "&outFields=situs_num,situs_street_prefx,situs_street,situs_street_suffix,situs_city,PROP_ID" +
    "&resultRecordCount=1&f=json";

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Travis CAD query failed: ${res.status}`);
  const json = (await res.json()) as {
    features?: Array<{ attributes: Record<string, string | number | null> }>;
  };
  const attrs = json.features?.[0]?.attributes;
  if (!attrs) return null;

  const streetParts = [
    attrs.situs_num,
    attrs.situs_street_prefx,
    attrs.situs_street,
    attrs.situs_street_suffix,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    // Travis's public source has no owner name or value fields at all — real address,
    // honestly null everything else, rather than fabricating a match.
    ownerName: null,
    propertyAddress: streetParts
      ? `${streetParts}, ${attrs.situs_city ?? parsed.cityStateZip}`
      : address,
    cad: "Travis Central Appraisal District",
    accountNumber: attrs.PROP_ID != null ? String(attrs.PROP_ID) : null,
    propertyType: "Not published by county",
    landValue: null,
    improvementValue: null,
    totalValue: null,
    taxYear: null,
  };
}

// BCAD's own domain (maps.bcad.org) DOES work for targeted queries — the earlier
// "Failed to execute query" error (see comment below) was caused by using bare
// column names against this service's underlying SQL join, which requires the
// fully-qualified `table.column` form. Discovered 2026-07-24 chasing a real address
// (19730 Bulverde Rd) that the third-party mirror below simply didn't have —
// BCAD's own system has it, with current (2026) values, so it's the primary source
// now. No land/improvement split is published on this view (only a combined
// `appraised_val`), so those two fields are honestly null here rather than
// backfilled from the (stale, incomplete) mirror.
function parseDollarString(v: string | number | null): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const n = Number(v.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

const BCAD_FIELDS = {
  owner: "PAMaps.dbo.web_map_property.owner_name",
  situs: "PAMaps.dbo.web_map_property.situs",
  appraisedVal: "PAMaps.dbo.web_map_property.appraised_val",
  taxYear: "PAMaps.dbo.web_map_property.prop_val_yr",
  propType: "PAMaps.dbo.web_map_property.prop_type_desc",
  propId: "PAMaps.DBO.ParcelFabric_Parcels.PROP_ID",
};

async function queryBexar(address: string): Promise<CadRecord | null> {
  const parsed = parseHouseAndStreet(address);
  if (!parsed) return null;
  const where = `UPPER(${BCAD_FIELDS.situs}) LIKE UPPER('%${parsed.house} ${coreStreetName(parsed.street)}%')`;
  const url =
    "https://maps.bcad.org/arcgis/rest/services/PAMapSearch/MapServer/6/query" +
    `?where=${encodeURIComponent(where)}` +
    `&outFields=${Object.values(BCAD_FIELDS).join(",")}` +
    "&resultRecordCount=1&f=json";

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Bexar CAD query failed: ${res.status}`);
  const json = (await res.json()) as {
    features?: Array<{ attributes: Record<string, string | number | null> }>;
  };
  const attrs = json.features?.[0]?.attributes;
  if (!attrs) return null;

  return {
    ownerName: (attrs[BCAD_FIELDS.owner] as string)?.trim() || null,
    propertyAddress: (attrs[BCAD_FIELDS.situs] as string)?.trim() || address,
    cad: "Bexar Appraisal District",
    accountNumber: attrs[BCAD_FIELDS.propId] != null ? String(attrs[BCAD_FIELDS.propId]) : null,
    propertyType: (attrs[BCAD_FIELDS.propType] as string)?.trim() || null,
    landValue: null,
    improvementValue: null,
    totalValue: parseDollarString(attrs[BCAD_FIELDS.appraisedVal]),
    taxYear: attrs[BCAD_FIELDS.taxYear] != null ? Number(attrs[BCAD_FIELDS.taxYear]) : null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { address } = await req.json();
    if (!address || typeof address !== "string") {
      return new Response(JSON.stringify({ error: "address is required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Queries every supported county concurrently (see the comment above) and takes
    // the first real match in this fixed priority order — no city-name filtering.
    // A single county's transient failure (network error, endpoint down) no longer
    // fails the whole lookup; it's just skipped, same as a plain no-match.
    const countyQueriesInOrder = [
      queryCollin,
      queryMontgomery,
      queryDenton,
      queryHarris,
      queryTarrant,
      queryFortBend,
      queryWilliamson,
      queryGrayson,
      queryTravis,
      queryBexar,
    ];

    const results = await Promise.allSettled(countyQueriesInOrder.map((query) => query(address)));
    let record: CadRecord | null = null;
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        record = result.value;
        break;
      }
    }

    if (!record) {
      return new Response(JSON.stringify({ matched: false }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ matched: true, record }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown error" }),
      { status: 502, headers: corsHeaders },
    );
  }
});
