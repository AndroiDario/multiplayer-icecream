export const MAX_PLAYERS = 10;
export const TOTAL_QUARTERS = 12;
// Capitale iniziale di ogni squadra. La cassa poi cambia ogni trimestre del
// profitto (ricavi − costi). Unica leva di bilanciamento del gioco.
export const STARTING_CASH = 30000;

export const products = [
  {
    key: "classic",
    label: "Classic",
    description: "Reliable flavors for families and office workers.",
  },
  {
    key: "premium",
    label: "Premium",
    description: "Artisanal ingredients and a higher perceived quality.",
  },
  {
    key: "novelty",
    label: "Novelty",
    description: "Colorful limited editions that travel well on social media.",
  },
  {
    key: "healthy",
    label: "Healthy",
    description: "Low sugar, vegan, and wellness-oriented options.",
  },
] as const;

export const priceTiers = [
  { key: "low", label: "Low", price: 3.2, margin: 0.45 },
  { key: "standard", label: "Standard", price: 4.4, margin: 0.56 },
  { key: "premium", label: "Premium", price: 5.8, margin: 0.64 },
  { key: "luxury", label: "Luxury", price: 7.2, margin: 0.7 },
] as const;

export const districts = [
  {
    key: "downtown",
    label: "Downtown",
    x: 48,
    y: 31,
    traffic: 1.22,
    rent: 980,
    mix: { families: 0.18, professionals: 0.42, tourists: 0.24, students: 0.16 },
  },
  {
    key: "campus",
    label: "Campus",
    x: 24,
    y: 58,
    traffic: 1.05,
    rent: 620,
    mix: { families: 0.12, professionals: 0.2, tourists: 0.08, students: 0.6 },
  },
  {
    key: "park",
    label: "Riverside Park",
    x: 70,
    y: 62,
    traffic: 1.12,
    rent: 720,
    mix: { families: 0.45, professionals: 0.14, tourists: 0.25, students: 0.16 },
  },
  {
    key: "station",
    label: "Station",
    x: 76,
    y: 28,
    traffic: 1.18,
    rent: 840,
    mix: { families: 0.14, professionals: 0.34, tourists: 0.34, students: 0.18 },
  },
  {
    key: "oldtown",
    label: "Old Town",
    x: 36,
    y: 24,
    traffic: 0.94,
    rent: 690,
    mix: { families: 0.22, professionals: 0.18, tourists: 0.44, students: 0.16 },
  },
] as const;

export const researchOptions = [
  {
    key: "traffic",
    label: "District traffic heatmap",
    cost: 600,
    description: "Shows where footfall is rising or falling this quarter.",
  },
  {
    key: "segments",
    label: "Segment preferences",
    cost: 750,
    description: "Shows which customer groups favor each product and price.",
  },
  {
    key: "channels",
    label: "Channel forecast",
    cost: 500,
    description: "Shows expected reach efficiency for Google, Meta, and Influencer.",
  },
  {
    key: "competitors",
    label: "Competitor benchmark",
    cost: 650,
    description: "Shows rivals' locations, positioning, and current revenue.",
  },
] as const;

export type ProductKey = (typeof products)[number]["key"];
export type PriceKey = (typeof priceTiers)[number]["key"];
export type DistrictKey = (typeof districts)[number]["key"];
export type ResearchKey = (typeof researchOptions)[number]["key"];
export type RoomStatus = "lobby" | "active" | "complete";

export type QuarterDecisionInput = {
  product: ProductKey;
  priceTier: PriceKey;
  district: DistrictKey;
  googleBudget: number;
  metaBudget: number;
  influencerBudget: number;
};

export type MarketSnapshot = ReturnType<typeof buildMarketSnapshot>;

export type PlayerRow = {
  id: string;
  nickname: string;
  cumulativeRevenue: number;
  cumulativeProfit: number;
  cumulativeSatisfaction: number;
};

type Segment = "families" | "professionals" | "tourists" | "students";

const productFit: Record<ProductKey, Record<Segment, number>> = {
  classic: { families: 1.18, professionals: 0.96, tourists: 1.02, students: 1.0 },
  premium: { families: 0.94, professionals: 1.24, tourists: 1.16, students: 0.76 },
  novelty: { families: 1.02, professionals: 0.84, tourists: 1.12, students: 1.28 },
  healthy: { families: 1.08, professionals: 1.18, tourists: 0.86, students: 0.96 },
};

const segmentPriceTolerance: Record<Segment, number> = {
  families: 0.86,
  professionals: 1.14,
  tourists: 1.04,
  students: 0.72,
};

// --- Bilanciamento pubblicità ------------------------------------------------
// adLift = 1 + Σ_canale (budget/1000)^AD_EXPONENT · coeff · channelPower.
// L'esponente < 1 dà rendimenti decrescenti; i coefficienti sono scelti perché
// ~2.000 € su un canale producano un lift chiaramente visibile (~+20% unità).
const AD_EXPONENT = 0.6;
const AD_COEFFICIENTS = { google: 0.13, meta: 0.12, influencer: 0.115 } as const;
const BASE_UNITS = 720;
const UNITS_FLOOR = 18;
const NEUTRAL_CHANNEL_POWER = { google: 1, meta: 1, influencer: 1 };

function computeFit(mix: Record<string, number>, productKey: ProductKey) {
  return Object.entries(mix).reduce((sum, [segment, weight]) => {
    return sum + weight * productFit[productKey][segment as Segment];
  }, 0);
}

function computePriceFit(mix: Record<string, number>, priceValue: number) {
  return Object.entries(mix).reduce((sum, [segment, weight]) => {
    const tolerance = segmentPriceTolerance[segment as Segment];
    const premiumFactor = priceValue / 4.4;
    return (
      sum + weight * clamp(1.22 - Math.max(0, premiumFactor - tolerance) * 0.58, 0.54, 1.18)
    );
  }, 0);
}

function adContribution(budget: number, coeff: number, power: number) {
  const spend = Math.max(0, budget);
  if (spend <= 0) return 0;
  return Math.pow(spend / 1000, AD_EXPONENT) * coeff * power;
}

function computeAdLift(
  budgets: Pick<
    QuarterDecisionInput,
    "googleBudget" | "metaBudget" | "influencerBudget"
  >,
  power: { google: number; meta: number; influencer: number }
) {
  return (
    1 +
    adContribution(budgets.googleBudget, AD_COEFFICIENTS.google, power.google) +
    adContribution(budgets.metaBudget, AD_COEFFICIENTS.meta, power.meta) +
    adContribution(budgets.influencerBudget, AD_COEFFICIENTS.influencer, power.influencer)
  );
}

function crowdingFactor(sameDistrictCount: number) {
  return clamp(1 - Math.max(0, sameDistrictCount - 1) * 0.08, 0.64, 1);
}

const seasonProfiles = [
  { name: "Spring", demand: 1.04, note: "mild weather lifts park and campus visits" },
  { name: "Summer", demand: 1.26, note: "tourists and outdoor traffic peak" },
  { name: "Autumn", demand: 0.92, note: "students return but leisure traffic cools" },
  { name: "Winter", demand: 0.78, note: "cold weather reduces impulse purchases" },
] as const;

const events = [
  {
    name: "Heatwave",
    note: "High temperatures reward good availability and broad reach.",
    demand: 1.18,
    channel: "google",
    district: "park",
  },
  {
    name: "Rainy Month",
    note: "Bad weather shifts demand toward commuters and search intent.",
    demand: 0.88,
    channel: "google",
    district: "station",
  },
  {
    name: "City Festival",
    note: "Tourists crowd the old center and respond to social discovery.",
    demand: 1.14,
    channel: "meta",
    district: "oldtown",
  },
  {
    name: "Inflation Pressure",
    note: "Customers become price sensitive and low-price offers gain appeal.",
    demand: 0.94,
    channel: "google",
    district: "campus",
  },
  {
    name: "Tourism Spike",
    note: "Visitor traffic makes premium and novelty positioning more attractive.",
    demand: 1.12,
    channel: "influencer",
    district: "station",
  },
  {
    name: "Social Trend",
    note: "Viral flavor content increases returns from Meta and Influencer.",
    demand: 1.08,
    channel: "influencer",
    district: "campus",
  },
] as const;

export function buildMarketSnapshot(seed: number, quarter: number) {
  const season = seasonProfiles[(quarter - 1) % 4];
  const event = events[pick(seed, quarter, events.length)];
  const baseDemand = round(
    season.demand * event.demand * (0.96 + noise(seed, quarter, 3) * 0.1),
    3
  );

  // Resa dei canali: ogni canale ha un "pavimento" alto (≈1.0) così che spendere
  // renda sempre qualcosa, ma il canale favorito dall'evento è nettamente migliore
  // (1.30×). Così la ricerca «channels» resta preziosa senza che la pubblicità
  // diventi una scommessa al buio.
  const channelPower = {
    google: round(
      (event.channel === "google" ? 1.3 : 1) * (1.0 + noise(seed, quarter, 5) * 0.16),
      3
    ),
    meta: round(
      (event.channel === "meta" ? 1.3 : 1) * (0.98 + noise(seed, quarter, 7) * 0.16),
      3
    ),
    influencer: round(
      (event.channel === "influencer" ? 1.3 : 1) *
        (0.96 + noise(seed, quarter, 11) * 0.18),
      3
    ),
  };

  const districtTraffic = districts.map((district, index) => {
    const lift = event.district === district.key ? 1.16 : 1;
    return {
      key: district.key,
      label: district.label,
      x: district.x,
      y: district.y,
      traffic: round(
        district.traffic * lift * (0.86 + noise(seed, quarter, index + 17) * 0.26),
        3
      ),
      rent: district.rent,
      mix: district.mix,
    };
  });

  return {
    quarter,
    year: Math.ceil(quarter / 4),
    quarterOfYear: ((quarter - 1) % 4) + 1,
    season: season.name,
    seasonNote: season.note,
    event: event.name,
    eventNote: event.note,
    baseDemand,
    channelPower,
    districtTraffic,
  };
}

export function validateDecision(
  decision: Partial<QuarterDecisionInput>,
  researchSpend: number,
  availableCash: number,
  // Se impostato (Q2–Q4), la location è bloccata sulla scelta di inizio anno:
  // il valore inviato dal client viene ignorato a favore di questo.
  lockedDistrict?: DistrictKey | null
) {
  const product = products.find((item) => item.key === decision.product)?.key;
  const priceTier = priceTiers.find((item) => item.key === decision.priceTier)?.key;
  const district =
    lockedDistrict ?? districts.find((item) => item.key === decision.district)?.key;
  const googleBudget = cleanBudget(decision.googleBudget);
  const metaBudget = cleanBudget(decision.metaBudget);
  const influencerBudget = cleanBudget(decision.influencerBudget);
  const adSpend = googleBudget + metaBudget + influencerBudget;

  if (!product || !priceTier || !district) {
    return { error: "Scegli prodotto, prezzo e luogo prima di inviare." };
  }

  if (adSpend + researchSpend > availableCash) {
    return { error: "Pubblicità e ricerche superano la cassa disponibile." };
  }

  return {
    decision: {
      product,
      priceTier,
      district,
      googleBudget,
      metaBudget,
      influencerBudget,
    },
  };
}

export function defaultDecision(): QuarterDecisionInput {
  return {
    product: "classic",
    priceTier: "standard",
    district: "park",
    googleBudget: 0,
    metaBudget: 0,
    influencerBudget: 0,
  };
}

export function evaluateQuarter(
  player: PlayerRow,
  decision: QuarterDecisionInput,
  market: MarketSnapshot,
  competitorDecisions: QuarterDecisionInput[],
  researchSpend: number
) {
  const district = districts.find((item) => item.key === decision.district)!;
  const marketDistrict = market.districtTraffic.find(
    (item) => item.key === decision.district
  )!;
  const price = priceTiers.find((item) => item.key === decision.priceTier)!;
  const product = products.find((item) => item.key === decision.product)!;

  const fit = computeFit(district.mix, product.key);
  const priceFit = computePriceFit(district.mix, price.price);
  const adLift = computeAdLift(decision, market.channelPower);
  const sameDistrict = competitorDecisions.filter(
    (item) => item.district === decision.district
  ).length;
  const crowding = crowdingFactor(sameDistrict);
  const units = Math.max(
    UNITS_FLOOR,
    Math.round(
      BASE_UNITS *
        market.baseDemand *
        marketDistrict.traffic *
        fit *
        priceFit *
        adLift *
        crowding
    )
  );
  const revenue = round(units * price.price, 2);
  const adSpend =
    decision.googleBudget + decision.metaBudget + decision.influencerBudget;
  const productCost = round(units * price.price * (1 - price.margin), 2);
  const totalExpenses = round(productCost + district.rent + adSpend + researchSpend, 2);
  const profit = round(revenue - totalExpenses, 2);
  const satisfaction = round(
    clamp(54 + fit * 21 + priceFit * 12 - (1 - crowding) * 16, 0, 100),
    1
  );

  return {
    playerId: player.id,
    revenue,
    profit,
    units,
    satisfaction,
    drivers: {
      productFit: round(fit, 2),
      priceFit: round(priceFit, 2),
      adLift: round(adLift, 2),
      crowding: round(crowding, 2),
      traffic: marketDistrict.traffic,
      rent: district.rent,
      unitPrice: price.price,
      productCost,
      adSpend,
      researchSpend,
      totalExpenses,
      autoSubmitted: false,
    },
  };
}

export type QuarterProjection = {
  units: number;
  revenue: number;
  profit: number;
  unitsLow: number;
  unitsHigh: number;
  revenueLow: number;
  revenueHigh: number;
  profitLow: number;
  profitHigh: number;
  adLift: number;
};

// Stima — usata lato client — dei gelati/ricavi/profitto attesi dalla scelta
// corrente. Riusa gli stessi helper di `evaluateQuarter` così la previsione
// coincide col calcolo reale. Ogni dato di mercato ancora ignoto è sostituito
// da un'assunzione neutra che allarga la banda `low–high`: comprare la ricerca
// corrispondente lo rende noto e stringe la stima (è il ritorno della spesa).
export function projectQuarter(
  decision: QuarterDecisionInput,
  params: {
    baseDemand: number;
    districtTraffic: number; // valore rivelato se trafficKnown, altrimenti traffico base
    trafficKnown: boolean;
    mix: Record<string, number>;
    rent: number;
    channelPower: { google: number; meta: number; influencer: number } | null; // null = ignoto
    crowding: number | null; // null = ignoto (concorrenti non rivelati)
    researchSpend: number;
  }
): QuarterProjection {
  const price = priceTiers.find((item) => item.key === decision.priceTier) ?? priceTiers[1];
  const product = products.find((item) => item.key === decision.product) ?? products[0];

  const fit = computeFit(params.mix, product.key);
  const priceFit = computePriceFit(params.mix, price.price);

  // Resa dei canali: se ignota uso un punto neutro (1.0) con banda 0.95–1.35.
  const power = params.channelPower ?? NEUTRAL_CHANNEL_POWER;
  const adLift = computeAdLift(decision, power);
  const adLiftLow = params.channelPower
    ? adLift
    : computeAdLift(decision, { google: 0.95, meta: 0.95, influencer: 0.95 });
  const adLiftHigh = params.channelPower
    ? adLift
    : computeAdLift(decision, { google: 1.35, meta: 1.35, influencer: 1.35 });

  // Traffico: se ignoto, punto = traffico base, banda 0.82×–1.28× (copre evento + rumore).
  const trafficPoint = params.districtTraffic;
  const trafficLow = params.trafficKnown ? trafficPoint : trafficPoint * 0.82;
  const trafficHigh = params.trafficKnown ? trafficPoint : trafficPoint * 1.28;

  // Affollamento: se ignoto, punto prudente 0.92 con banda 0.78–1.0.
  const crowdingPoint = params.crowding ?? 0.92;
  const crowdingLow = params.crowding ?? 0.78;
  const crowdingHigh = params.crowding ?? 1.0;

  const unitsFor = (traffic: number, lift: number, crowd: number) =>
    Math.max(
      UNITS_FLOOR,
      Math.round(BASE_UNITS * params.baseDemand * traffic * fit * priceFit * lift * crowd)
    );

  const units = unitsFor(trafficPoint, adLift, crowdingPoint);
  const unitsLow = unitsFor(trafficLow, adLiftLow, crowdingLow);
  const unitsHigh = unitsFor(trafficHigh, adLiftHigh, crowdingHigh);

  const adSpend =
    Math.max(0, decision.googleBudget) +
    Math.max(0, decision.metaBudget) +
    Math.max(0, decision.influencerBudget);
  const fixedCost = params.rent + adSpend + params.researchSpend;
  const profitFor = (u: number) => round(u * price.price * price.margin - fixedCost, 2);

  return {
    units,
    revenue: round(units * price.price, 2),
    profit: profitFor(units),
    unitsLow,
    unitsHigh,
    revenueLow: round(unitsLow * price.price, 2),
    revenueHigh: round(unitsHigh * price.price, 2),
    profitLow: profitFor(unitsLow),
    profitHigh: profitFor(unitsHigh),
    adLift: round(adLift, 2),
  };
}

// Primo trimestre dell'anno a cui appartiene `quarter` (1, 5, 9 …). La location
// si sceglie qui e resta bloccata per i trimestri successivi dello stesso anno.
export function firstQuarterOfYear(quarter: number) {
  return quarter - ((quarter - 1) % 4);
}

export function researchCost(type: string) {
  return researchOptions.find((item) => item.key === type)?.cost ?? null;
}

export function publicResearchData(
  market: MarketSnapshot,
  purchased: string[],
  competitors: Array<{
    nickname: string;
    product?: string | null;
    priceTier?: string | null;
    district?: string | null;
    revenue?: number | null;
  }>
) {
  return {
    baseline: {
      quarter: market.quarter,
      year: market.year,
      quarterOfYear: market.quarterOfYear,
      season: market.season,
      seasonNote: market.seasonNote,
      event: market.event,
      eventNote: market.eventNote,
      baseDemand: market.baseDemand,
    },
    traffic: purchased.includes("traffic") ? market.districtTraffic : null,
    segments: purchased.includes("segments")
      ? {
          productFit,
          segmentPriceTolerance,
        }
      : null,
    channels: purchased.includes("channels") ? market.channelPower : null,
    competitors: purchased.includes("competitors") ? competitors : null,
  };
}

export function makeRoomCode(seed: number) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code += alphabet[pick(seed + i * 97, i + 1, alphabet.length)];
  }
  return code;
}

function cleanBudget(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
}

function pick(seed: number, quarter: number, length: number) {
  return Math.floor(noise(seed, quarter, length) * length) % length;
}

function noise(seed: number, quarter: number, salt: number) {
  const x = Math.sin(seed * 12.9898 + quarter * 78.233 + salt * 37.719) * 43758.5453;
  return x - Math.floor(x);
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
