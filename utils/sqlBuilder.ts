import { FilterState } from '../types';
import { US_STATES, DUCKDB_DATASET_FILE, MIN_WAIST, MAX_WAIST, MIN_RFM, MAX_RFM } from '../constants';

export const S3_PATH = DUCKDB_DATASET_FILE;

export const generateDuckDBQuery = (filters: FilterState): string => {
  const whereClauses: string[] = [];

  // 1. Geography Logic
  // Check if selectedCBSA is a non-empty string
  if (filters.selectedCBSA && filters.selectedCBSA !== '') {
    // Cast to ensure type compatibility if cbsa_id is numeric
    whereClauses.push(`cbsa_id = ${filters.selectedCBSA}`);
  } 
  else if (filters.selectedState && filters.selectedState !== 'US') {
    // Find FIPS code from constants
    const stateObj = US_STATES.find(s => s.abbr === filters.selectedState);
    if (stateObj && stateObj.fips) {
      whereClauses.push(`state = ${stateObj.fips}`);
    }
  }

  // 2. Demographics
  const sexCode = filters.gender === 'Male' ? 1 : 2;
  whereClauses.push(`sex = ${sexCode}`);
  
  whereClauses.push(`age BETWEEN ${filters.ageRange[0]} AND ${filters.ageRange[1]}`);

  // MARITAL STATUS: 1 = Married. 
  // If NOT including married people, exclude MAR=1
  if (!filters.includeMarried) {
    whereClauses.push(`married != 1`);
  }

  // 3. Socioeconomic
  // Income - Handle NULLs. If range is wide open (starting at 0), include NULLs to avoid dropping people with missing income data.
  // Otherwise, if user strictly wants > 50k, we assume they want KNOWN > 50k.
  if (filters.incomeRange[0] === 0) {
      whereClauses.push(`(real_income BETWEEN ${filters.incomeRange[0] * 1000} AND ${filters.incomeRange[1] * 1000} OR real_income IS NULL)`);
  } else {
      whereClauses.push(`real_income BETWEEN ${filters.incomeRange[0] * 1000} AND ${filters.incomeRange[1] * 1000}`);
  }
  
  // Education
  const allEduSelected = filters.education.noDegree && filters.education.college && filters.education.gradDegree;
  if (!allEduSelected) {
    const mappedEdu = [];
    if (filters.education.noDegree) mappedEdu.push(1); 
    if (filters.education.college) mappedEdu.push(2);  
    if (filters.education.gradDegree) mappedEdu.push(3); 
    
    if (mappedEdu.length > 0) {
      whereClauses.push(`educ IN (${mappedEdu.join(', ')})`);
    } else {
      whereClauses.push("1=0");
    }
  }

  // 4. Physical
  // Height - Same logic as income. Include NULLs if range covers the minimum (48 inches / 4ft) to avoid accidental exclusion.
  if (filters.heightRange[0] <= 48 && filters.heightRange[1] >= 96) {
    whereClauses.push(`(height_inches BETWEEN ${filters.heightRange[0]} AND ${filters.heightRange[1]} OR height_inches IS NULL)`);
  } else {
    whereClauses.push(`height_inches BETWEEN ${filters.heightRange[0]} AND ${filters.heightRange[1]}`);
  }
  
  // Physical Flags
  const { physicalFlags } = filters;
  const bodyTypeFlags: Array<keyof FilterState['physicalFlags']> = ['thin', 'fit', 'overweight', 'obese'];
  const allBodyFlagsOff = bodyTypeFlags.every(flag => !physicalFlags[flag]);
  if (allBodyFlagsOff) {
    whereClauses.push('1=0');
  } else {
    bodyTypeFlags.forEach(flag => {
      if (!physicalFlags[flag]) {
        whereClauses.push(`${flag} = FALSE`);
      }
    });
  }

  if (physicalFlags.abs) {
    whereClauses.push('abs = TRUE');
  }

  if (filters.waistRange[0] > MIN_WAIST || filters.waistRange[1] < MAX_WAIST) {
    whereClauses.push(`waist_circumference BETWEEN ${filters.waistRange[0]} AND ${filters.waistRange[1]}`);
  }
  if (filters.rfmRange[0] > MIN_RFM || filters.rfmRange[1] < MAX_RFM) {
    whereClauses.push(`rfm BETWEEN ${filters.rfmRange[0]} AND ${filters.rfmRange[1]}`);
  }

  // 5. Race
  const allRacesSelected = Object.values(filters.race).every(Boolean);
  if (!allRacesSelected) {
    const raceMapped = [];
    if (filters.race.white) raceMapped.push(1);
    if (filters.race.black) raceMapped.push(2);
    if (filters.race.asian) raceMapped.push(3);
    if (filters.race.hispanic) raceMapped.push(4);
    if (filters.race.other) raceMapped.push(5);
    
    if (raceMapped.length > 0) {
      whereClauses.push(`race_mapped IN (${raceMapped.join(', ')})`);
    } else {
      whereClauses.push("1=0");
    }
  }

  // 6. Habits
  if (!filters.smoking.smoker) whereClauses.push("is_smoker = 0");
  if (!filters.drinking.drinker) whereClauses.push("drinks_per_day = 0");

  // 7. Kids
  if (filters.excludePeopleWithKids) whereClauses.push("has_kids = 0");

  // 8. Politics
  if (filters.politicsView === 'broad') {
    const allPoliticsSelected = Object.values(filters.politics).every(Boolean);
    if (!allPoliticsSelected) {
      const pols = [];
      if (filters.politics.conservative) pols.push("'Conservative'");
      if (filters.politics.moderate) pols.push("'Moderate'");
      if (filters.politics.liberal) pols.push("'Liberal'");
      if (filters.politics.apolitical) pols.push("'No_Ideology'"); // Corrected mapping from screenshot
      
      if (pols.length > 0) {
         whereClauses.push(`politics_broad IN (${pols.join(', ')})`);
      } else {
         whereClauses.push("1=0");
      }
    }
  } else {
    // Detailed Politics
    if (filters.politicsDetailed.length > 0) {
       const quoted = filters.politicsDetailed.map(p => `'${p}'`).join(', ');
       whereClauses.push(`politics_detailed IN (${quoted})`);
    } else {
       whereClauses.push("1=0");
    }
  }

  // 9. Religion
  if (filters.religionView === 'broad') {
    const allReligionSelected = Object.values(filters.religion).every(Boolean);
    if (!allReligionSelected) {
      const rels = [];
      if (filters.religion.christian) rels.push("'Christian'");
      if (filters.religion.agnosticAtheist) rels.push("'Secular'"); // Corrected mapping from screenshot
      if (filters.religion.spiritual) rels.push("'Spiritual'");
      if (filters.religion.other) rels.push("'Other_Faith'"); // Corrected mapping from screenshot
      
      if (rels.length > 0) {
        whereClauses.push(`religion_broad IN (${rels.join(', ')})`);
      } else {
         whereClauses.push("1=0");
      }
    }
  } else {
    // Detailed Religion
    if (filters.religionDetailed.length > 0) {
       const quoted = filters.religionDetailed.map(r => `'${r}'`).join(', ');
       whereClauses.push(`religion_detailed IN (${quoted})`);
    } else {
       whereClauses.push("1=0");
    }
  }

  const cbsaDenominator = filters.selectedCBSA
    ? `,\n  (SELECT sum(PWGTP)::DOUBLE FROM '${S3_PATH}' WHERE cbsa_id = ${filters.selectedCBSA}) as total_cbsa_pop`
    : '';

  return `SELECT \n  count(*)::DOUBLE as count, \n  sum(PWGTP)::DOUBLE as weighted_population${cbsaDenominator} \nFROM '${S3_PATH}' \nWHERE \n  ${whereClauses.join('\n  AND ')}`;
};
