import { POLITICS_DETAILED_OPTIONS, RELIGION_DETAILED_OPTIONS } from "./constants";

export type Gender = 'Male' | 'Female';

export type BodyTypeFemale = 'Thin' | 'Fit' | 'Curvy';
export type BodyTypeMale = 'Thin' | 'Fit' | 'Big';
export type BodyType = BodyTypeFemale | BodyTypeMale;

export type PoliticalView = 'Conservative' | 'Moderate' | 'Liberal' | 'Apolitical';

export interface FilterState {
  // Geo
  selectedState: string;
  selectedCBSA: string; // Using CBSA Code
  
  // Demographics
  gender: Gender;
  ageRange: [number, number];
  
  // Advanced - Socioeconomic
  incomeRange: [number, number]; // Annual income in thousands
  education: {
    noDegree: boolean;
    college: boolean;
    gradDegree: boolean;
  };

  // Advanced - Physical
  heightRange: [number, number]; // Inches
  bodyTypes: string[]; // Strings because they depend on gender

  // Advanced - Background
  race: {
    white: boolean;
    black: boolean;
    asian: boolean;
    hispanic: boolean;
    other: boolean;
  };
  
  // Advanced - Lifestyle
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
  includeMarried: boolean; // New field for MAR status
  
  // View Modes
  politicsView: 'broad' | 'detailed';
  religionView: 'broad' | 'detailed';

  // Detailed Selections
  politicsDetailed: string[];
  religionDetailed: string[];

  // Broad Selections (Legacy/Simple)
  politics: {
    conservative: boolean;
    moderate: boolean;
    liberal: boolean;
    apolitical: boolean;
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
  incomeRange: [0, 500],
  education: {
    noDegree: true,
    college: true,
    gradDegree: true,
  },
  heightRange: [66, 90], // Default for Male: 5'6" to 7'6"
  bodyTypes: ['Thin', 'Fit', 'Curvy', 'Big'],
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
  includeMarried: true, // Changed to true to capture full adult population (~270M)
  
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
  religion: {
    christian: true,
    agnosticAtheist: true,
    spiritual: true,
    other: true,
  },
};