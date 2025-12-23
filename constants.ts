

export const DUCKDB_S3_ENDPOINT = 'sfo3.digitaloceanspaces.com';
export const DUCKDB_BUCKET_NAME = 'dcalc';
export const DUCKDB_DATASET_FILE = 'synthetic_population_mvp.parquet';
export const DUCKDB_REMOTE_URL = `https://${DUCKDB_S3_ENDPOINT}/${DUCKDB_BUCKET_NAME}/${DUCKDB_DATASET_FILE}`;
export const MIN_WAIST = 22;
export const MAX_WAIST = 90;
export const MIN_RFM = 10;
export const MAX_RFM = 65;

export const US_STATES = [
  { abbr: "US", name: "National", fips: 0 },
  { abbr: "AL", name: "Alabama", fips: 1 }, { abbr: "AK", name: "Alaska", fips: 2 }, { abbr: "AZ", name: "Arizona", fips: 4 },
  { abbr: "AR", name: "Arkansas", fips: 5 }, { abbr: "CA", name: "California", fips: 6 }, { abbr: "CO", name: "Colorado", fips: 8 },
  { abbr: "CT", name: "Connecticut", fips: 9 }, { abbr: "DE", name: "Delaware", fips: 10 }, { abbr: "DC", name: "District of Columbia", fips: 11 },
  { abbr: "FL", name: "Florida", fips: 12 }, { abbr: "GA", name: "Georgia", fips: 13 }, { abbr: "HI", name: "Hawaii", fips: 15 },
  { abbr: "ID", name: "Idaho", fips: 16 }, { abbr: "IL", name: "Illinois", fips: 17 }, { abbr: "IN", name: "Indiana", fips: 18 },
  { abbr: "IA", name: "Iowa", fips: 19 }, { abbr: "KS", name: "Kansas", fips: 20 }, { abbr: "KY", name: "Kentucky", fips: 21 },
  { abbr: "LA", name: "Louisiana", fips: 22 }, { abbr: "ME", name: "Maine", fips: 23 }, { abbr: "MD", name: "Maryland", fips: 24 },
  { abbr: "MA", name: "Massachusetts", fips: 25 }, { abbr: "MI", name: "Michigan", fips: 26 }, { abbr: "MN", name: "Minnesota", fips: 27 },
  { abbr: "MS", name: "Mississippi", fips: 28 }, { abbr: "MO", name: "Missouri", fips: 29 }, { abbr: "MT", name: "Montana", fips: 30 },
  { abbr: "NE", name: "Nebraska", fips: 31 }, { abbr: "NV", name: "Nevada", fips: 32 }, { abbr: "NH", name: "New Hampshire", fips: 33 },
  { abbr: "NJ", name: "New Jersey", fips: 34 }, { abbr: "NM", name: "New Mexico", fips: 35 }, { abbr: "NY", name: "New York", fips: 36 },
  { abbr: "NC", name: "North Carolina", fips: 37 }, { abbr: "ND", name: "North Dakota", fips: 38 }, { abbr: "OH", name: "Ohio", fips: 39 },
  { abbr: "OK", name: "Oklahoma", fips: 40 }, { abbr: "OR", name: "Oregon", fips: 41 }, { abbr: "PA", name: "Pennsylvania", fips: 42 },
  { abbr: "RI", name: "Rhode Island", fips: 44 }, { abbr: "SC", name: "South Carolina", fips: 45 }, { abbr: "SD", name: "South Dakota", fips: 46 },
  { abbr: "TN", name: "Tennessee", fips: 47 }, { abbr: "TX", name: "Texas", fips: 48 }, { abbr: "UT", name: "Utah", fips: 49 },
  { abbr: "VT", name: "Vermont", fips: 50 }, { abbr: "VA", name: "Virginia", fips: 51 }, { abbr: "WA", name: "Washington", fips: 53 },
  { abbr: "WV", name: "West Virginia", fips: 54 }, { abbr: "WI", name: "Wisconsin", fips: 55 }, { abbr: "WY", name: "Wyoming", fips: 56 }
];

// Top ~50 CBSAs by population for demonstration (Fallback data)
export const CBSA_DATA = [
  { id: "35620", name: "New York-Newark-Jersey City, NY-NJ-PA", states: ["NY", "NJ", "PA"] },
  { id: "31080", name: "Los Angeles-Long Beach-Anaheim, CA", states: ["CA"] },
  { id: "16980", name: "Chicago-Naperville-Elgin, IL-IN-WI", states: ["IL", "IN", "WI"] },
  { id: "19100", name: "Dallas-Fort Worth-Arlington, TX", states: ["TX"] },
  { id: "26420", name: "Houston-The Woodlands-Sugar Land, TX", states: ["TX"] },
  { id: "47900", name: "Washington-Arlington-Alexandria, DC-VA-MD-WV", states: ["DC", "VA", "MD", "WV"] },
  { id: "37980", name: "Philadelphia-Camden-Wilmington, PA-NJ-DE-MD", states: ["PA", "NJ", "DE", "MD"] },
  { id: "33100", name: "Miami-Fort Lauderdale-West Palm Beach, FL", states: ["FL"] },
  { id: "12060", name: "Atlanta-Sandy Springs-Alpharetta, GA", states: ["GA"] },
  { id: "14460", name: "Boston-Cambridge-Newton, MA-NH", states: ["MA", "NH"] },
  { id: "38060", name: "Phoenix-Mesa-Chandler, AZ", states: ["AZ"] },
  { id: "41860", name: "San Francisco-Oakland-Berkeley, CA", states: ["CA"] },
  { id: "40140", name: "Riverside-San Bernardino-Ontario, CA", states: ["CA"] },
  { id: "19820", name: "Detroit-Warren-Dearborn, MI", states: ["MI"] },
  { id: "42660", name: "Seattle-Tacoma-Bellevue, WA", states: ["WA"] },
  { id: "33460", name: "Minneapolis-St. Paul-Bloomington, MN-WI", states: ["MN", "WI"] },
  { id: "41740", name: "San Diego-Chula Vista-Carlsbad, CA", states: ["CA"] },
  { id: "45300", name: "Tampa-St. Petersburg-Clearwater, FL", states: ["FL"] },
  { id: "19740", name: "Denver-Aurora-Lakewood, CO", states: ["CO"] },
  { id: "12580", name: "Baltimore-Columbia-Towson, MD", states: ["MD"] },
  { id: "41180", name: "St. Louis, MO-IL", states: ["MO", "IL"] },
  { id: "36740", name: "Orlando-Kissimmee-Sanford, FL", states: ["FL"] },
  { id: "16740", name: "Charlotte-Concord-Gastonia, NC-SC", states: ["NC", "SC"] },
  { id: "41700", name: "San Antonio-New Braunfels, TX", states: ["TX"] },
  { id: "38900", name: "Portland-Vancouver-Hillsboro, OR-WA", states: ["OR", "WA"] },
  { id: "40900", name: "Sacramento-Roseville-Folsom, CA", states: ["CA"] },
  { id: "38300", name: "Pittsburgh, PA", states: ["PA"] },
  { id: "29820", name: "Las Vegas-Henderson-Paradise, NV", states: ["NV"] },
  { id: "12420", name: "Austin-Round Rock-Georgetown, TX", states: ["TX"] },
  { id: "17140", name: "Cincinnati, OH-KY-IN", states: ["OH", "KY", "IN"] },
  { id: "28140", name: "Kansas City, MO-KS", states: ["MO", "KS"] },
  { id: "18140", name: "Columbus, OH", states: ["OH"] },
  { id: "26900", name: "Indianapolis-Carmel-Anderson, IN", states: ["IN"] },
  { id: "17460", name: "Cleveland-Elyria, OH", states: ["OH"] },
  { id: "41940", name: "San Jose-Sunnyvale-Santa Clara, CA", states: ["CA"] },
  { id: "34980", name: "Nashville-Davidson--Murfreesboro--Franklin, TN", states: ["TN"] },
  { id: "47260", name: "Virginia Beach-Norfolk-Newport News, VA-NC", states: ["VA", "NC"] },
  { id: "39300", name: "Providence-Warwick, RI-MA", states: ["RI", "MA"] },
  { id: "27260", name: "Jacksonville, FL", states: ["FL"] },
  { id: "33340", name: "Milwaukee-Waukesha, WI", states: ["WI"] },
  { id: "36420", name: "Oklahoma City, OK", states: ["OK"] },
  { id: "40060", name: "Richmond, VA", states: ["VA"] },
  { id: "39580", name: "Raleigh-Cary, NC", states: ["NC"] },
  { id: "32820", name: "Memphis, TN-MS-AR", states: ["TN", "MS", "AR"] },
  { id: "31140", name: "Louisville/Jefferson County, KY-IN", states: ["KY", "IN"] },
  { id: "41620", name: "Salt Lake City, UT", states: ["UT"] },
  { id: "35380", name: "New Orleans-Metairie, LA", states: ["LA"] },
  { id: "25540", name: "Hartford-East Hartford-Middletown, CT", states: ["CT"] },
  { id: "15380", name: "Buffalo-Cheektowaga, NY", states: ["NY"] },
  { id: "13820", name: "Birmingham-Hoover, AL", states: ["AL"] }
];

export const BODY_TYPES_FEMALE = ['Thin', 'Fit', 'Curvy'];
export const BODY_TYPES_MALE = ['Thin', 'Fit', 'Big'];

export const MIN_AGE = 18;
export const MAX_AGE = 85;

export const MIN_INCOME = 0;
export const MAX_INCOME = 500; // k+

export const MIN_HEIGHT = 48; // 4'0"
export const MAX_HEIGHT = 90; // 7'6"

// Estimated Grip Strength (kg) for top quintile (approximate)
export const GRIP_STRENGTH_FEMALE_THRESHOLD = 63.0; 
export const GRIP_STRENGTH_MALE_THRESHOLD = 100.0;

export const POLITICS_DETAILED_OPTIONS = [
  'Conservative', 
  'Liberal', 
  'Moderate', 
  'Not Sure', 
  'Very Conservative', 
  'Very Liberal'
];

export const RELIGION_DETAILED_OPTIONS = [
  'Atheist_Agnostic', 
  'Buddhist', 
  'Catholic', 
  'Hindu', 
  'Jewish', 
  'Mormon', 
  'Muslim', 
  'Orthodox', 
  'Other_Faith', 
  'Protestant', 
  'Spiritual_None'
];
