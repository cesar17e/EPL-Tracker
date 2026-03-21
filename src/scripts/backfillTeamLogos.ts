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

type TeamRow = {
  id: number;
  name: string;
  name_for_url: string | null;
  logo_url: string | null;
};

async function main() {
  const { rows } = await pool.query<TeamRow>(
    `
    SELECT id, name, name_for_url, logo_url
    FROM teams
    ORDER BY name ASC
    `
  );

  let updated = 0;
  let alreadySet = 0;
  const missing: string[] = [];

  for (const team of rows) {
    const key = team.name_for_url;

    if (!key) {
      missing.push(`${team.name} (missing name_for_url)`);
      continue;
    }

    const logoUrl = TEAM_LOGOS[key];
    if (!logoUrl) {
      missing.push(`${team.name} (${key})`);
      continue;
    }

    if (team.logo_url === logoUrl) {
      alreadySet++;
      continue;
    }

    await pool.query(
      `
      UPDATE teams
      SET logo_url = $2,
          updated_at = now()
      WHERE id = $1
      `,
      [team.id, logoUrl]
    );

    updated++;
    console.log(`Updated ${team.name} -> ${logoUrl}`);
  }

  console.log(`\nDone. Updated ${updated} teams. ${alreadySet} already matched.`);

  if (missing.length > 0) {
    console.log("\nMissing mappings:");
    for (const entry of missing) {
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
