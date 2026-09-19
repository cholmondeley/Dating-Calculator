import { POLITICS_DETAILED_OPTIONS, RELIGION_DETAILED_OPTIONS, MIN_WAIST, MAX_WAIST, MIN_WHR, MAX_WHR, MIN_FAT, MAX_FAT } from "./constants";

export type Gender = 'Male' | 'Female';

export type BodyType = 'Thin' | 'Healthy weight' | 'Fit' | 'Overweight' | 'Obese';
export type BodyFlag = 'thin' | 'healthy_weight' | 'fit' | 'overweight' | 'obese';
export const BODY_TYPE_FLAG: Record<BodyType, BodyFlag> = {
  'Thin': 'thin', 'Healthy weight': 'healthy_weight', 'Fit': 'fit', 'Overweight': 'overweight', 'Obese': 'obese',
};

export type PoliticalView = 'Conservative' | 'Moderate' | 'Liberal' | 'Apolitical';
export type AbsMode = 'off' | 'visible' | 'strict';
export type Relationship = 'single' | 'unmarried' | 'any';     // single = not married AND not cohabiting
export type Finance = 'any' | 'core' | 'high';
export type WaistMode = 'natural' | 'nhanes';

export interface FilterState {
  // Geo
  selectedState: string;
  selectedCBSA: string; // Using CBSA Code

  // Demographics
  gender: Gender;
  ageRange: [number, number];

  // Socioeconomic
  incomeRange: [number, number]; // Annual income in thousands
  netWorthMin: number;           // dollars; 0 = any
  finance: Finance;
  trustFund: boolean;            // expected-value filter (probability per row)
  education: {
    noDegree: boolean;
    college: boolean;
    gradDegree: boolean;
  };

  // Physical
  heightRange: [number, number]; // Inches
  physicalFlags: Record<BodyFlag, boolean>;
  absMode: AbsMode;
  waistMode: WaistMode;
  waistRange: [number, number];
  whrRange: [number, number];    // women only
  fatRange: [number, number];
  blueEyes: boolean;             // expected-value filter (probability per row)

  // Background
  race: {
    white: boolean;
    black: boolean;
    asian: boolean;
    hispanic: boolean;
    other: boolean;
  };

  // Lifestyle
  smoking: {
    nonSmoker: boolean;
    smoker: boolean;
  };
  drinking: {
    nonDrinker: boolean;
    drinker: boolean;
  };

  // Dealbreakers
  excludePeopleWithKids: boolean;
  relationship: Relationship;

  // View Modes
  politicsView: 'broad' | 'detailed';
  religionView: 'broad' | 'detailed';

  // Detailed Selections
  politicsDetailed: string[];
  religionDetailed: string[];

  // Broad Selections
  politics: {
    conservative: boolean;
    moderate: boolean;
    liberal: boolean;
    apolitical: boolean;
  };
  party: {
    democrat: boolean;
    republican: boolean;
    independent: boolean;
  };

  religion: {
    christian: boolean;
    agnosticAtheist: boolean;
    spiritual: boolean;
    other: boolean;
  };
}

export const INITIAL_STATE: FilterState = {
  selectedState: 'US', // Default to National
  selectedCBSA: '',
  gender: 'Male',
  ageRange: [18, 35], // Changed default to 18-35
  incomeRange: [0, 1000],
  netWorthMin: 0,
  finance: 'any',
  trustFund: false,
  education: {
    noDegree: true,
    college: true,
    gradDegree: true,
  },
  heightRange: [48, 90], // everyone (4'0" to 7'6"); a hidden height floor silently shrank the pool
  physicalFlags: {
    thin: true,
    healthy_weight: true,
    fit: true,
    overweight: true,
    obese: true,
  },
  absMode: 'off',
  waistMode: 'natural',
  waistRange: [MIN_WAIST, MAX_WAIST],
  whrRange: [MIN_WHR, MAX_WHR],
  fatRange: [MIN_FAT, MAX_FAT],
  blueEyes: false,
  race: {
    white: true,
    black: true,
    asian: true,
    hispanic: true,
    other: true,
  },
  smoking: {
    nonSmoker: true,
    smoker: true,
  },
  drinking: {
    nonDrinker: true,
    drinker: true,
  },
  excludePeopleWithKids: true, // Default to true per request
  relationship: 'single',  // not married and not cohabiting
  
  politicsView: 'broad',
  religionView: 'broad',
  politicsDetailed: [...POLITICS_DETAILED_OPTIONS],
  religionDetailed: [...RELIGION_DETAILED_OPTIONS],

  politics: {
    conservative: true,
    moderate: true,
    liberal: true,
    apolitical: true,
  },
  party: {
    democrat: true,
    republican: true,
    independent: true,
  },
  religion: {
    christian: true,
    agnosticAtheist: true,
    spiritual: true,
    other: true,
  },
};
