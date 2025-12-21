import { FilterState } from '../types';
import { US_STATES, GRIP_STRENGTH_FEMALE_THRESHOLD, GRIP_STRENGTH_MALE_THRESHOLD } from '../constants';

const BUCKET_NAME = 'dcalc';
const PARQUET_FILE = 'synthetic_population_mvp.parquet';
export const S3_PATH = `https://sfo3.digitaloceanspaces.com/${BUCKET_NAME}/${PARQUET_FILE}`;

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
      whereClauses.push(`STATE = ${stateObj.fips}`);
    }
  }

  // 2. Demographics
  const sexCode = filters.gender === 'Male' ? 1 : 2;
  whereClauses.push(`SEX = ${sexCode}`);
  
  whereClauses.push(`AGEP BETWEEN ${filters.ageRange[0]} AND ${filters.ageRange[1]}`);

  // MARITAL STATUS: 1 = Married. 
  // If NOT including married people, exclude MAR=1
  if (!filters.includeMarried) {
    whereClauses.push(`MAR != 1`);
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
  
  // Body Types
  const types = filters.bodyTypes;
  const currentBodyTypes = filters.gender === 'Female' ? ['Thin', 'Fit', 'Curvy'] : ['Thin', 'Fit', 'Big'];
  const allBodyTypesSelected = currentBodyTypes.every(t => types.includes(t));

  if (!allBodyTypesSelected) {
    const bodyConditions: string[] = [];
    
    // NOTE: This logic assumes 'grip_strength' (kg) column exists in the parquet file.
    if (filters.gender === 'Female') {
        // Female Logic
        if (types.includes('Thin')) {
            // BMI <= 22
            bodyConditions.push("(bmi <= 22)");
        }
        if (types.includes('Fit')) {
            // BMI <= 25 AND High Grip
            bodyConditions.push(`(bmi <= 25 AND grip_strength >= ${GRIP_STRENGTH_FEMALE_THRESHOLD})`);
        }
        if (types.includes('Curvy')) {
            // Everyone else: NOT Thin AND NOT Fit
            // i.e. BMI > 25 OR (BMI > 22 AND Low Grip)
            bodyConditions.push(`(bmi > 25 OR (bmi > 22 AND grip_strength < ${GRIP_STRENGTH_FEMALE_THRESHOLD}))`);
        }
    } else {
        // Male Logic
        if (types.includes('Thin')) {
            // BMI <= 25
            bodyConditions.push("(bmi <= 25)");
        }
        if (types.includes('Fit')) {
             // BMI <= 27 AND High Grip
            bodyConditions.push(`(bmi <= 27 AND grip_strength >= ${GRIP_STRENGTH_MALE_THRESHOLD})`);
        }
        if (types.includes('Big')) {
             // Everyone else: NOT Thin AND NOT Fit
             // i.e. BMI > 27 OR (BMI > 25 AND Low Grip)
            bodyConditions.push(`(bmi > 27 OR (bmi > 25 AND grip_strength < ${GRIP_STRENGTH_MALE_THRESHOLD}))`);
        }
    }
    
    if (bodyConditions.length > 0) {
      whereClauses.push(`(${bodyConditions.join(' OR ')})`);
    } else {
      whereClauses.push("1=0"); 
    }
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

  // Casting to DOUBLE is crucial to avoid BigInt issues in JS conversion
  return `SELECT \n  count(*)::DOUBLE as count, \n  sum(PWGTP)::DOUBLE as weighted_population \nFROM '${S3_PATH}' \nWHERE \n  ${whereClauses.join('\n  AND ')}`;
};
