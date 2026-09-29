// Foreign Direct Product rules (15 CFR 734.9) as a per-item questionnaire.
// Only rules whose destination / party scope is met are asked; rules from which
// exports from partner countries (Supp. No. 3 to Part 746, incl. Japan) are excluded are skipped.
import type { Case, Item } from "../../shared/case.ts";
import { inGroup, type EngineData } from "../data.ts";

export interface FdpRule {
  id: string;
  para: string;
  name: string;
  product: string;
  scope: string;
  relevant: (c: Case, item: Item, d: EngineData) => boolean;
}

const partner = (c: Case, d: EngineData) => d.ear.partnerCountries.some((p) => p.iso2 === c.shipFrom && p.scope === "Full");

export const FDP_GATE = {
  id: "gate",
  text: "Is this item a direct product of US-origin technology or software, or produced by a plant (or major component of a plant) that is itself a direct product of US-origin technology or software?",
};

export const FDP_RULES: FdpRule[] = [
  {
    id: "b",
    para: "734.9(b)",
    name: "National Security FDP",
    product: "Direct product of US-origin technology/software requiring a written assurance (or of a plant that is), and the item itself is NS-controlled",
    scope: "Destined to Country Group D:1, E:1 or E:2",
    relevant: (c, _i, d) => inGroup(d, c.destination, "D:1", "E:1", "E:2"),
  },
  {
    id: "c",
    para: "734.9(c)",
    name: "9x515 FDP",
    product: "Direct product of US-origin 9D515/9E515 technology or software, and the item is a 9x515 item",
    scope: "Destined to Country Group D:5, E:1 or E:2",
    relevant: (c, _i, d) => inGroup(d, c.destination, "D:5", "E:1", "E:2"),
  },
  {
    id: "d",
    para: "734.9(d)",
    name: '"600 series" FDP',
    product: 'Direct product of US-origin "600 series" technology or software, and the item is a "600 series" item or 0A919',
    scope: "Destined to Country Group D:1, D:3, D:4, D:5, E:1 or E:2",
    relevant: (c, _i, d) => inGroup(d, c.destination, "D:1", "D:3", "D:4", "D:5", "E:1", "E:2"),
  },
  {
    id: "e",
    para: "734.9(e)",
    name: "Entity List FDP (Footnotes 1, 4, 5)",
    product: "Direct product of Category 3/4/5 technology or software subject to the EAR (or of a plant that is)",
    scope: "An Entity List party with a Footnote 1, 4 or 5 designation is a party, or the item will be incorporated into items produced/purchased/ordered by one",
    relevant: () => true,
  },
  {
    id: "g",
    para: "734.9(g)",
    name: "Russia/Belarus Military End User & Procurement FDP (Footnote 3)",
    product: "Direct product of technology or software subject to the EAR in any Category D/E ECCN (or of a plant that is)",
    scope: "An Entity List party with a Footnote 3 designation is a party, or the item will be incorporated into items produced/purchased/ordered by one",
    relevant: () => true,
  },
  {
    id: "f",
    para: "734.9(f)",
    name: "Russia / Belarus / Crimea FDP",
    product: "Direct product of US-origin technology or software in any Category D/E ECCN, and the item is on the CCL or in Supp. No. 6/7 to Part 746",
    scope: "Destined to Russia, Belarus or the Crimea region",
    relevant: (c, _i, d) => ["RU", "BY"].includes(c.destination) && !partner(c, d),
  },
  {
    id: "h",
    para: "734.9(h)",
    name: "Advanced Computing FDP",
    product: "Direct product of specified Category 3/4/5 technology or software, and the item is 3A090, 4A090, related .z items, or technology for them",
    scope: "Destined to Macau or Country Group D:1/D:4/D:5 (excluding A:5/A:6), or a Macau/D:5-headquartered entity is a party",
    relevant: (c, _i, d) => c.destination === "MO" || (inGroup(d, c.destination, "D:1", "D:4", "D:5") && !inGroup(d, c.destination, "A:5", "A:6")),
  },
  {
    id: "i",
    para: "734.9(i)",
    name: '"Supercomputer" FDP',
    product: "Direct product of specified Category 3/4/5 technology or software (or of a plant that is)",
    scope: 'Knowledge the item will be used for a "supercomputer" located in or destined to Macau or Country Group D:5',
    relevant: (c, _i, d) => c.destination === "MO" || inGroup(d, c.destination, "D:5"),
  },
  {
    id: "j",
    para: "734.9(j)",
    name: "Iran FDP",
    product: "Direct product of US-origin Category 3–9 D/E technology or software, and the item is in Supp. No. 7 to Part 746 or a Category 3–9 ECCN",
    scope: "Destined to Iran, or the Government of Iran is a party",
    relevant: (c, _i, d) => c.destination === "IR" && !partner(c, d),
  },
];

export function relevantFdpRules(c: Case, item: Item, d: EngineData): FdpRule[] {
  return FDP_RULES.filter((r) => r.relevant(c, item, d));
}
