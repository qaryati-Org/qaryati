import { MigrationInterface, QueryRunner } from 'typeorm';

// Search indexes (e.g. pg_trgm on names) are intentionally NOT added here:
// they are added later as the evidence-based optimization after the k6
// baseline, so the before/after difference can be measured.
export class CreateGovernoratesAndVillages1793102400000 implements MigrationInterface {
  name = 'CreateGovernoratesAndVillages1793102400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "governorates" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name_ar" varchar(100) NOT NULL UNIQUE,
        "name_en" varchar(100) NOT NULL UNIQUE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )`);

    await queryRunner.query(`
      CREATE TABLE "villages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name_ar" varchar(150) NOT NULL,
        "name_en" varchar(150),
        "governorate_id" uuid NOT NULL
          REFERENCES "governorates"("id") ON DELETE RESTRICT,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_villages_governorate_name_ar" UNIQUE ("governorate_id", "name_ar")
      )`);

    // Reference data: the 16 Palestinian governorates.
    await queryRunner.query(`
      INSERT INTO "governorates" ("name_ar", "name_en") VALUES
        ('جنين', 'Jenin'),
        ('طوباس', 'Tubas'),
        ('طولكرم', 'Tulkarm'),
        ('نابلس', 'Nablus'),
        ('قلقيلية', 'Qalqilya'),
        ('سلفيت', 'Salfit'),
        ('رام الله والبيرة', 'Ramallah and Al-Bireh'),
        ('أريحا', 'Jericho'),
        ('القدس', 'Jerusalem'),
        ('بيت لحم', 'Bethlehem'),
        ('الخليل', 'Hebron'),
        ('شمال غزة', 'North Gaza'),
        ('غزة', 'Gaza'),
        ('دير البلح', 'Deir al-Balah'),
        ('خان يونس', 'Khan Yunis'),
        ('رفح', 'Rafah')`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "villages"`);
    await queryRunner.query(`DROP TABLE "governorates"`);
  }
}
