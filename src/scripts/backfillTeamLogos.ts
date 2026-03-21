import "dotenv/config";
import { pool } from "../db/pool.js";

const TEAM_LOGOS: Record<string, string> = {
  arsenal: "https://upload.wikimedia.org/wikipedia/en/5/53/Arsenal_FC.svg",
  "aston-villa": "https://upload.wikimedia.org/wikipedia/en/9/9a/Aston_Villa_FC_new_crest.svg",
  bournemouth: "https://upload.wikimedia.org/wikipedia/sco/e/e5/AFC_Bournemouth_%282013%29.svg",
  brentford: "https://upload.wikimedia.org/wikipedia/en/2/2a/Brentford_FC_crest.svg",
  brighton: "https://upload.wikimedia.org/wikipedia/sco/f/fd/Brighton_%26_Hove_Albion_logo.svg",
  burnley: "https://upload.wikimedia.org/wikipedia/en/6/6d/Burnley_FC_Logo.svg",
  chelsea: "https://upload.wikimedia.org/wikipedia/sco/c/cc/Chelsea_FC.svg",
  "crystal-palace": "https://upload.wikimedia.org/wikipedia/sco/0/0c/Crystal_Palace_FC_logo.svg",
  everton: "https://upload.wikimedia.org/wikipedia/sco/7/7c/Everton_FC_logo.svg",
  fulham: "https://upload.wikimedia.org/wikipedia/en/e/eb/Fulham_FC_%28shield%29.svg",
  "leeds-united": "https://upload.wikimedia.org/wikipedia/en/5/54/Leeds_United_F.C._logo.svg",
  liverpool: "https://upload.wikimedia.org/wikipedia/sco/0/0c/Liverpool_FC.svg",
  "manchester-city": "https://upload.wikimedia.org/wikipedia/sco/e/eb/Manchester_City_FC_badge.svg",
  "manchester-united": "https://upload.wikimedia.org/wikipedia/en/7/7a/Manchester_United_FC_crest.svg",
  "newcastle-united": "https://upload.wikimedia.org/wikipedia/sco/5/56/Newcastle_United_Logo.svg",
  "nottingham-forest": "https://upload.wikimedia.org/wikipedia/sco/d/d2/Nottingham_Forest_logo.svg",
  sunderland: "https://upload.wikimedia.org/wikipedia/sco/7/77/Logo_Sunderland.svg",
  tottenham: "https://upload.wikimedia.org/wikipedia/sco/b/b4/Tottenham_Hotspur.svg",
  "west-ham-united": "https://upload.wikimedia.org/wikipedia/sco/c/c2/West_Ham_United_FC_logo.svg",
  wolves: "https://upload.wikimedia.org/wikipedia/sco/f/fc/Wolverhampton_Wanderers.svg",
};

const TEAM_SHORT_NAMES: Record<string, string> = {
  arsenal: "Arsenal",
  "aston-villa": "Villa",
  bournemouth: "Bournemouth",
  brentford: "Brentford",
  brighton: "Brighton",
  burnley: "Burnley",
  chelsea: "Chelsea",
  "crystal-palace": "Palace",
  everton: "Everton",
  fulham: "Fulham",
  "leeds-united": "Leeds",
  liverpool: "Liverpool",
  "manchester-city": "Man City",
  "manchester-united": "Man Utd",
  "newcastle-united": "Newcastle",
  "nottingham-forest": "Forest",
  sunderland: "Sunderland",
  tottenham: "Spurs",
  "west-ham-united": "West Ham",
  wolves: "Wolves",
};

type TeamRow = {
  id: number;
  name: string;
  name_for_url: string | null;
  short_name: string | null;
  logo_url: string | null;
};

async function main() {
  const { rows } = await pool.query<TeamRow>(
    `
    SELECT id, name, name_for_url, short_name, logo_url
    FROM teams
    ORDER BY name ASC
    `
  );

  let updated = 0;
  let alreadySet = 0;
  const missingLogos: string[] = [];
  const missingShortNames: string[] = [];

  for (const team of rows) {
    const key = team.name_for_url;

    if (!key) {
      missingLogos.push(`${team.name} (missing name_for_url)`);
      missingShortNames.push(`${team.name} (missing name_for_url)`);
      continue;
    }

    const logoUrl = TEAM_LOGOS[key];
    const shortName = TEAM_SHORT_NAMES[key];

    if (!logoUrl) missingLogos.push(`${team.name} (${key})`);
    if (!shortName) missingShortNames.push(`${team.name} (${key})`);

    if (!logoUrl && !shortName) {
      continue;
    }

    const logoAlreadySet = !logoUrl || team.logo_url === logoUrl;
    const shortNameAlreadySet = !shortName || team.short_name === shortName;

    if (logoAlreadySet && shortNameAlreadySet) {
      alreadySet++;
      continue;
    }

    await pool.query(
      `
      UPDATE teams
      SET logo_url = COALESCE($2, logo_url),
          short_name = COALESCE($3, short_name),
          updated_at = now()
      WHERE id = $1
      `,
      [team.id, logoUrl ?? null, shortName ?? null]
    );

    updated++;
    console.log(
      `Updated ${team.name} -> logo=${logoUrl ?? team.logo_url ?? "unchanged"}, shortName=${shortName ?? team.short_name ?? "unchanged"}`
    );
  }

  console.log(`\nDone. Updated ${updated} teams. ${alreadySet} already matched.`);

  if (missingLogos.length > 0) {
    console.log("\nMissing logo mappings:");
    for (const entry of missingLogos) {
      console.log(`- ${entry}`);
    }
  }

  if (missingShortNames.length > 0) {
    console.log("\nMissing short-name mappings:");
    for (const entry of missingShortNames) {
      console.log(`- ${entry}`);
    }
  }
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Backfill failed:", err);
    try {
      await pool.end();
    } catch {}
    process.exit(1);
  });
