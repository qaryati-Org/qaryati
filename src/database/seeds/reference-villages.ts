// Reference data: real Palestinian villages and towns, by governorate
// (governorate names must match governorates.name_en from the first
// migration). Only identity data is seeded here: population figures and
// source citations are left to be entered with their real provenance.

export interface SeedVillage {
  nameAr: string;
  nameEn: string;
  nameOrigin?: string;
}

export const REFERENCE_VILLAGES: Record<string, SeedVillage[]> = {
  Nablus: [
    { nameAr: 'برقة', nameEn: 'Burqa' },
    {
      nameAr: 'سبسطية',
      nameEn: 'Sebastia',
      nameOrigin:
        'From Sebaste, the Greek name Herod gave the city in honour of Augustus (Sebastos).',
    },
    { nameAr: 'عصيرة الشمالية', nameEn: 'Asira ash-Shamaliya' },
    { nameAr: 'بيتا', nameEn: 'Beita' },
    { nameAr: 'حوارة', nameEn: 'Huwwara' },
    { nameAr: 'قبلان', nameEn: 'Qabalan' },
    { nameAr: 'عقربا', nameEn: 'Aqraba' },
    { nameAr: 'بيت فوريك', nameEn: 'Beit Furik' },
    { nameAr: 'طلوزة', nameEn: 'Talluza' },
    { nameAr: 'دير شرف', nameEn: 'Deir Sharaf' },
    { nameAr: 'بيت دجن', nameEn: 'Beit Dajan' },
    { nameAr: 'عورتا', nameEn: 'Awarta' },
  ],
  Jenin: [
    { nameAr: 'يعبد', nameEn: "Ya'bad" },
    { nameAr: 'عرابة', nameEn: 'Arraba' },
    { nameAr: 'قباطية', nameEn: 'Qabatiya' },
    { nameAr: 'برقين', nameEn: 'Burqin' },
    { nameAr: 'جبع', nameEn: "Jaba'" },
    { nameAr: 'سيلة الحارثية', nameEn: 'Silat al-Harithiya' },
    { nameAr: 'فقوعة', nameEn: "Faqqu'a" },
    { nameAr: 'الزبابدة', nameEn: 'Zababdeh' },
    { nameAr: 'عانين', nameEn: 'Anin' },
    { nameAr: 'كفر راعي', nameEn: "Kafr Ra'i" },
  ],
  'Ramallah and Al-Bireh': [
    { nameAr: 'بيرزيت', nameEn: 'Birzeit' },
    { nameAr: 'سنجل', nameEn: 'Sinjil' },
    { nameAr: 'ترمسعيا', nameEn: 'Turmus Ayya' },
    { nameAr: 'النبي صالح', nameEn: 'Nabi Salih' },
    { nameAr: 'بلعين', nameEn: "Bil'in" },
    { nameAr: 'نعلين', nameEn: "Ni'lin" },
    { nameAr: 'دير دبوان', nameEn: 'Deir Dibwan' },
    { nameAr: 'الطيبة', nameEn: 'Taybeh' },
    { nameAr: 'سلواد', nameEn: 'Silwad' },
    { nameAr: 'عين يبرود', nameEn: 'Ein Yabrud' },
    { nameAr: 'كوبر', nameEn: 'Kobar' },
    { nameAr: 'عابود', nameEn: 'Aboud' },
  ],
  Hebron: [
    { nameAr: 'بني نعيم', nameEn: "Bani Na'im" },
    { nameAr: 'حلحول', nameEn: 'Halhul' },
    { nameAr: 'بيت أمر', nameEn: 'Beit Ummar' },
    { nameAr: 'سعير', nameEn: "Sa'ir" },
    { nameAr: 'يطا', nameEn: 'Yatta' },
    { nameAr: 'دورا', nameEn: 'Dura' },
    { nameAr: 'ترقوميا', nameEn: 'Tarqumiya' },
    { nameAr: 'إذنا', nameEn: 'Idhna' },
    { nameAr: 'بيت أولا', nameEn: 'Beit Ula' },
    { nameAr: 'صوريف', nameEn: 'Surif' },
    { nameAr: 'الظاهرية', nameEn: 'Adh-Dhahiriya' },
    { nameAr: 'السموع', nameEn: "As-Samu'" },
  ],
  Bethlehem: [
    { nameAr: 'بتير', nameEn: 'Battir' },
    {
      nameAr: 'بيت ساحور',
      nameEn: 'Beit Sahour',
      nameOrigin:
        'Commonly explained as "place of the night watch", after the shepherds who guarded their flocks there.',
    },
    { nameAr: 'بيت جالا', nameEn: 'Beit Jala' },
    { nameAr: 'الخضر', nameEn: 'Al-Khader' },
    { nameAr: 'نحالين', nameEn: 'Nahalin' },
    { nameAr: 'حوسان', nameEn: 'Husan' },
    { nameAr: 'تقوع', nameEn: "Tuqu'" },
    { nameAr: 'أرطاس', nameEn: 'Artas' },
    { nameAr: 'وادي فوكين', nameEn: 'Wadi Fukin' },
    { nameAr: 'الولجة', nameEn: 'Al-Walaja' },
  ],
  Tulkarm: [
    { nameAr: 'عنبتا', nameEn: 'Anabta' },
    { nameAr: 'دير الغصون', nameEn: 'Deir al-Ghusun' },
    { nameAr: 'عتيل', nameEn: 'Attil' },
    { nameAr: 'بلعا', nameEn: "Bal'a" },
    { nameAr: 'قفين', nameEn: 'Qaffin' },
    { nameAr: 'علار', nameEn: 'Illar' },
    { nameAr: 'كفر اللبد', nameEn: 'Kafr al-Labad' },
    { nameAr: 'شويكة', nameEn: 'Shweika' },
  ],
  Qalqilya: [
    { nameAr: 'عزون', nameEn: 'Azzun' },
    { nameAr: 'حبلة', nameEn: 'Hableh' },
    { nameAr: 'كفر ثلث', nameEn: 'Kafr Thulth' },
    { nameAr: 'جيوس', nameEn: 'Jayyus' },
    { nameAr: 'كفر قدوم', nameEn: 'Kafr Qaddum' },
    { nameAr: 'إماتين', nameEn: 'Immatain' },
    { nameAr: 'كفر لاقف', nameEn: 'Kafr Laqif' },
  ],
  Salfit: [
    { nameAr: 'كفل حارس', nameEn: 'Kifl Haris' },
    { nameAr: 'دير استيا', nameEn: 'Deir Istiya' },
    { nameAr: 'بروقين', nameEn: 'Bruqin' },
    { nameAr: 'كفر الديك', nameEn: 'Kafr ad-Dik' },
    { nameAr: 'مسحة', nameEn: 'Mas-ha' },
    { nameAr: 'قراوة بني حسان', nameEn: 'Qarawat Bani Hassan' },
    { nameAr: 'حارس', nameEn: 'Haris' },
    { nameAr: 'ياسوف', nameEn: 'Yasuf' },
    { nameAr: 'الزاوية', nameEn: 'Az-Zawiya' },
  ],
  Tubas: [
    { nameAr: 'طمون', nameEn: 'Tammun' },
    { nameAr: 'عقابا', nameEn: 'Aqqaba' },
    { nameAr: 'تياسير', nameEn: 'Tayasir' },
    { nameAr: 'بردلة', nameEn: 'Bardala' },
    { nameAr: 'عين البيضاء', nameEn: 'Ein al-Beida' },
  ],
  Jericho: [
    { nameAr: 'العوجا', nameEn: 'Al-Auja' },
    { nameAr: 'النويعمة', nameEn: "An-Nuway'imah" },
    { nameAr: 'فصايل', nameEn: 'Fasayil' },
    { nameAr: 'الجفتلك', nameEn: 'Al-Jiftlik' },
    { nameAr: 'عين الديوك', nameEn: 'Ein ad-Duyuk' },
  ],
  Jerusalem: [
    { nameAr: 'أبو ديس', nameEn: 'Abu Dis' },
    {
      nameAr: 'العيزرية',
      nameEn: 'Al-Eizariya',
      nameOrigin:
        'Named after Lazarus (al-Azar), whose tomb is traditionally placed in the village.',
    },
    { nameAr: 'عناتا', nameEn: 'Anata' },
    { nameAr: 'بدو', nameEn: 'Biddu' },
    { nameAr: 'بيت إكسا', nameEn: 'Beit Iksa' },
    { nameAr: 'قلنديا', nameEn: 'Qalandia' },
    { nameAr: 'حزما', nameEn: 'Hizma' },
    // A second Jaba' (the other is in Jenin): the same Arabic name in two
    // governorates is allowed by uq_villages_governorate_name_ar.
    { nameAr: 'جبع', nameEn: "Jaba'" },
    { nameAr: 'قطنة', nameEn: 'Qatanna' },
    { nameAr: 'الرام', nameEn: 'Ar-Ram' },
  ],
  'North Gaza': [
    { nameAr: 'بيت لاهيا', nameEn: 'Beit Lahia' },
    { nameAr: 'بيت حانون', nameEn: 'Beit Hanoun' },
    { nameAr: 'جباليا', nameEn: 'Jabalia' },
  ],
  Gaza: [
    { nameAr: 'جحر الديك', nameEn: 'Juhor ad-Dik' },
    { nameAr: 'المغراقة', nameEn: 'Al-Mughraqa' },
    { nameAr: 'الزهراء', nameEn: 'Az-Zahra' },
  ],
  'Deir al-Balah': [
    { nameAr: 'الزوايدة', nameEn: 'Az-Zawayda' },
    { nameAr: 'المصدر', nameEn: 'Al-Musaddar' },
    { nameAr: 'وادي السلقا', nameEn: 'Wadi as-Salqa' },
    { nameAr: 'المغازي', nameEn: 'Al-Maghazi' },
  ],
  'Khan Yunis': [
    { nameAr: 'بني سهيلا', nameEn: 'Bani Suheila' },
    { nameAr: 'عبسان الكبيرة', nameEn: 'Abasan al-Kabira' },
    { nameAr: 'خزاعة', nameEn: "Khuza'a" },
    { nameAr: 'القرارة', nameEn: 'Al-Qarara' },
  ],
  Rafah: [
    { nameAr: 'الشوكة', nameEn: 'Al-Shokat' },
    { nameAr: 'النصر', nameEn: 'An-Nasr' },
  ],
};

export interface SeedVillageName {
  governorate: string;
  villageAr: string;
  name: string;
  type: 'ALTERNATIVE_SPELLING' | 'TRANSLITERATION' | 'HISTORICAL';
  language: string;
  period?: string;
}

// Common alternative spellings and well-known former names.
export const REFERENCE_VILLAGE_NAMES: SeedVillageName[] = [
  {
    governorate: 'Nablus',
    villageAr: 'برقة',
    name: 'Burka',
    type: 'ALTERNATIVE_SPELLING',
    language: 'en',
  },
  {
    governorate: 'Nablus',
    villageAr: 'سبسطية',
    name: 'Sabastiya',
    type: 'ALTERNATIVE_SPELLING',
    language: 'en',
  },
  {
    governorate: 'Nablus',
    villageAr: 'سبسطية',
    name: 'Sebaste',
    type: 'HISTORICAL',
    language: 'el',
    period: 'Roman period',
  },
  {
    governorate: 'Jenin',
    villageAr: 'يعبد',
    name: 'Yabad',
    type: 'ALTERNATIVE_SPELLING',
    language: 'en',
  },
  {
    governorate: 'Jenin',
    villageAr: 'عرابة',
    name: 'Arrabeh',
    type: 'ALTERNATIVE_SPELLING',
    language: 'en',
  },
  {
    governorate: 'Jenin',
    villageAr: 'الزبابدة',
    name: 'Az-Zababida',
    type: 'ALTERNATIVE_SPELLING',
    language: 'en',
  },
  {
    governorate: 'Ramallah and Al-Bireh',
    villageAr: 'بيرزيت',
    name: 'Bir Zeit',
    type: 'ALTERNATIVE_SPELLING',
    language: 'en',
  },
  {
    governorate: 'Ramallah and Al-Bireh',
    villageAr: 'الطيبة',
    name: 'At-Tayba',
    type: 'ALTERNATIVE_SPELLING',
    language: 'en',
  },
  {
    governorate: 'Hebron',
    villageAr: 'يطا',
    name: 'Yata',
    type: 'ALTERNATIVE_SPELLING',
    language: 'en',
  },
  {
    governorate: 'Hebron',
    villageAr: 'حلحول',
    name: 'Halhoul',
    type: 'ALTERNATIVE_SPELLING',
    language: 'en',
  },
  {
    governorate: 'Bethlehem',
    villageAr: 'بيت ساحور',
    name: 'Beit Sahur',
    type: 'ALTERNATIVE_SPELLING',
    language: 'en',
  },
  {
    governorate: 'Bethlehem',
    villageAr: 'بتير',
    name: 'Bittir',
    type: 'ALTERNATIVE_SPELLING',
    language: 'en',
  },
  {
    governorate: 'Bethlehem',
    villageAr: 'تقوع',
    name: 'Tekoa',
    type: 'HISTORICAL',
    language: 'en',
    period: 'Biblical period',
  },
  {
    governorate: 'Jerusalem',
    villageAr: 'العيزرية',
    name: 'Bethany',
    type: 'HISTORICAL',
    language: 'en',
    period: 'Biblical period',
  },
];
