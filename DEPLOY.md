# রেনাটা পিএলসি ওভারটাইম অ্যাপ — মোবাইল ডিপ্লয়মেন্ট ও ব্যবহার নির্দেশিকা (DEPLOY.md)

এই নির্দেশিকাটি শুধুমাত্র একটি অ্যান্ড্রয়েড মোবাইল ফোন ব্যবহার করে সম্পূর্ণ নিরাপদে আপনার GitHub রিপোজিটরিতে (`checkot/checkot.github.io`) নতুন মডিউলার ফাইলগুলো আপলোড ও চালু করার জন্য তৈরি করা হয়েছে। আপনি যদি কোডিং না জানেন, তাহলেও নিচের সহজ ধাপগুলো হুবহু অনুসরণ করলেই কোনো ভুল ছাড়া অ্যাপ চালু থাকবে।

---

## ⚠️ গুরুত্বপূর্ণ সতর্কতা: কেন ফোনের ব্রাউজার দিয়ে সরাসরি ফোল্ডার আপলোড করা যায় না?

অ্যান্ড্রয়েড ফোনের ব্রাউজার দিয়ে GitHub ওয়েবসাইটে ফাইল আপলোড করতে গেলে:
1. ফোনের ফাইল পিকার দিয়ে কোনো **ফোল্ডার সিলেক্ট করা যায় না**।
2. ব্রাউজারে ফাইল টেনে আনলে GitHub ভেতরের সাব-ফোল্ডারগুলো মুছে ফেলে সব ফাইল একই জায়গায় ছড়িয়ে দেয়। এতে আমাদের `css/` এবং `js/` (যেমন: `js/core/`, `js/calculations/`, `js/components/`, `js/pages/`, `js/admin/` ইত্যাদির ৩৫টিরও বেশি ফাইল) তাদের সঠিক সাব-ফোল্ডার পাথ হারিয়ে নষ্ট হয়ে যাবে এবং অ্যাপ কাজ করবে না।

তাই নিচে দেওয়া **পদ্ধতি ১ (Termux + Git)** ব্যবহার করাই শতভাগ নির্ভরযোগ্য ও সেরা পদ্ধতি।

---

## পদ্ধতি ১ (প্রধান ও সবচেয়ে নির্ভরযোগ্য): Termux অ্যাপ ও Git ব্যবহার

Termux হলো অ্যান্ড্রয়েড ফোনের জন্য একটি ছোট ফ্রি টার্মিনাল অ্যাপ, যা দিয়ে কম্পিউটারের মতো নির্ভুলভাবে গিটহাবে ফাইল পুশ করা যায়।

### সম্পূর্ণ কার্যপ্রণালীর সঠিক ধারাবাহিকতা (Step-by-Step Execution Order):

---

### ধাপ ১: GitHub-এ টেস্ট রিপোজিটরি (`checkot-test`) তৈরি করা (Dry Run এর জন্য)
মূল প্রজেক্টে হাত দেওয়ার আগে একটি টেস্ট রিপোজিটরি তৈরি করে সবকিছু যাচাই করে নেওয়া বাধ্যতামূলক:
১. ফোনের ব্রাউজারে `github.com` এ লগইন করুন।
২. উপরে ডানে **`+`** আইকনে চাপ দিয়ে **"New repository"** সিলেক্ট করুন।
৩. **Repository name**: লিখুন `checkot-test`।
৪. **Public** নির্বাচন করুন।
৫. ⚠️ **গুরুত্বপূর্ণ**: অবশ্যই **"Add a README file"** চেকবক্সে টিক দিন (যাতে ডিফল্ট `main` ব্রাঞ্চ এখনই তৈরি হয়ে যায়)।
৬. **"Create repository"** বাটনে চাপ দিন।
৭. এরপর টেস্ট রিপোজিটরির **Settings** ➔ বামের মেনু থেকে **Pages** এ যান। **Build and deployment** এর নিচে Source হিসেবে **"Deploy from a branch"** এবং Branch হিসেবে **`main`** সিলেক্ট করে **Save** দিন।

---

### ধাপ ২: ৩০ দিনের মেয়াদের একটি সুরক্ষিত GitHub Token তৈরি করা
পাসওয়ার্ড দিয়ে সরাসরি গিটহাবে পুশ করা যায় না, তাই একটি নিরাপদ "Fine-grained Token" তৈরি করতে হবে:
১. ফোনের ব্রাউজারে আপনার প্রোফাইল ছবিতে চাপ দিয়ে যান: **Settings** ➔ একদম নিচে বামে **Developer Settings** ➔ **Personal access tokens** ➔ **Fine-grained tokens**।
২. **"Generate new token"** এ চাপ দিন:
   * **Token name**: লিখুন `phone-deploy`
   * **Expiration**: নির্বাচন করুন **"30 days"** (নিরাপত্তার স্বার্থে ৩০ দিনের মেয়াদ রাখুন)।
   * **Repository access**: নির্বাচন করুন **"Only select repositories"** এবং ড্রপডাউন থেকে **দুটি রিপোজিটরিই সিলেক্ট করুন**:
     1. `checkot/checkot.github.io` (মূল প্রোডাকশন)
     2. `checkot/checkot-test` (টেস্ট রিপোজিটরি)
   * **Permissions**: নিচে **"Repository permissions"** এ চাপ দিয়ে **"Contents"** অপশনটির ডানে **"Access"** ড্রপডাউনে **Read and write** সিলেক্ট করুন।
৩. একদম নিচে **"Generate token"** চাপুন। যে কোডটি আসবে (`github_pat_...`), সেটি কপি করে আপনার ফোনের একটি নিরাপদ নোটে রেখে দিন। এটি আর কখনো দেখা যাবে না।

> **টোকেন সংরক্ষণ সংক্রান্ত খোলামেলা সততা ও সতর্কতা:**
> নিচে ব্যবহৃত `git config --global credential.helper store` কমান্ডটি আপনার টোকেনটি আপনার ফোনের Termux অ্যাপের নিজস্ব সুরক্ষিত স্টোরেজে (`~/.git-credentials` ফাইলে) প্লেইন টেক্সট হিসেবে সংরক্ষণ করে। এটি আপনার গিট রিপোজিটরির ভেতরে কখনোই প্রবেশ করে না এবং ইন্টারনেটে কেউ দেখতে পায় না। তবুও ডিপ্লয়মেন্ট সম্পন্ন হওয়ার পর টোকেনটি ফোন থেকে সম্পূর্ণ মুছে ফেলার কমান্ড নিচে ধাপ ৮-এ দেওয়া হয়েছে।

---

### ধাপ ৩: Termux ইনস্টল ও সেটআপ
১. F-Droid (f-droid.org) থেকে বা GitHub থেকে **Termux** অ্যাপটি আপনার ফোনে ইনস্টল করুন (Play Store এর পুরনো ভার্সন ব্যবহার করবেন না)।
২. Termux ওপেন করে নিচের কমান্ড দুটি চালান (অনুমতি চাইলে কিবোর্ডে `y` লিখে Enter চাপুন):
```bash
pkg update -y && pkg install git unzip -y
termux-setup-storage
```
*(ফোনের স্ক্রিনে স্টোরেজ পারমিশন পপআপ আসলে "Allow" দিন।)*

---

### ধাপ ৪: ডেলিভারেবল জিপ ফাইল আনজিপ করা
১. আপনার ফোনে ডাউনলোড করা জিপ ফাইলটি (`rppf_step9b.zip`) আপনার ফোনের Download ফোল্ডারে রাখুন।
২. Termux-এ নিচের কমান্ড দিয়ে ফাইলগুলো আনজিপ করুন:
```bash
mkdir -p /sdcard/Download/rppf_step9b_extracted
unzip -o /sdcard/Download/rppf_step9b.zip -d /sdcard/Download/rppf_step9b_extracted/
```

---

### ধাপ ৫: গিট আইডেন্টিটি ও ক্রেডেনশিয়াল সেটআপ
প্রথমবার কমিট করার আগে আপনার গিট নাম ও ইমেইল সেট করতে হবে:
```bash
git config --global user.name "checkot"
git config --global user.email "checkot@users.noreply.github.com"
git config --global credential.helper store
```

---

### ধাপ ৬: টেস্ট রিপোজিটরিতে (`checkot-test`) ড্রাই রান ও ৮টি পয়েন্ট ভেরিফিকেশন
প্রথমে টেস্ট রিপোজিটরিতে ডিপ্লয় করে নিশ্চিত হওয়া যাক:

১. টেস্ট রিপোজিটরিটি ক্লোন করুন:
```bash
cd ~
rm -rf checkot-test
git clone --depth 1 https://github.com/checkot/checkot-test.git
cd checkot-test
```
*(ইউজারনেম চাইলে আপনার GitHub ইউজারনেম দিন এবং পাসওয়ার্ড চাইলে ধাপ ২-এর টোকেনটি পেস্ট করুন।)*

২. ⚠️ **শুধুমাত্র টেস্ট রিপোজিটরির জন্য ডেটা ফাইল কপি করা (Test Site Data Seeding)**:
যেহেতু আমাদের নতুন সেফটি আর্কিটেকচারে টেস্ট সাইটে `REMOTE_BASE_URL` স্বয়ংক্রিয়ভাবে টেস্ট রিপোজিটরির নিজস্ব পাথ (`https://checkot.github.io/checkot-test/`) নির্দেশ করে, তাই টেস্ট সাইটে রিপোর্ট বা লিডারবোর্ড দেখার জন্য টেস্ট রিপোজিটরিতে ডেটা ফাইলগুলো থাকা আবশ্যক।
*(সতর্কতা: নিচের ডেটা কপি করার কমান্ডগুলো **শুধুমাত্র টেস্ট রিপোজিটরির জন্য**, মূল প্রোডাকশনে কখনোই এটি করবেন না)*:
```bash
# প্রোডাকশন রিপোজিটরি থেকে প্রয়োজনীয় ডেটা ফাইল কপি করার জন্য সাময়িক ক্লোন:
cd ~
rm -rf ~/prod_temp
git clone --depth 1 https://github.com/checkot/checkot.github.io.git ~/prod_temp

# টেস্ট রিপোজিটরিতে ডেটা ফাইলগুলো কপি করা:
cd ~/checkot-test
cp ~/prod_temp/areas.json ~/prod_temp/team.json ~/prod_temp/notices.json ~/prod_temp/absent.json .
mkdir -p data
cp ~/prod_temp/data/2026-10.json data/

# সাময়িক প্রোডাকশন ক্লোন ফোল্ডার মুছে ফেলা:
rm -rf ~/prod_temp

# টেস্ট ডেটা কমিট ও পুশ:
git add areas.json team.json notices.json absent.json data/2026-10.json
git commit -m "Seed test data for checkot-test"
git push origin main
```

৩. ⚠️ **মডিউলার কোড ফাইলগুলো কপি করুন**:
*(কখনোই `cp -r .../* .` করবেন না! শুধুমাত্র অনুমোদিত ফাইল ও ফোল্ডার কপি করুন)*:
```bash
cd ~/checkot-test
cp /sdcard/Download/rppf_step9b_extracted/index.html .
cp /sdcard/Download/rppf_step9b_extracted/admin.html .
cp /sdcard/Download/rppf_step9b_extracted/sw.js .
cp /sdcard/Download/rppf_step9b_extracted/manifest.json .
cp /sdcard/Download/rppf_step9b_extracted/DEPLOY.md .
cp -r /sdcard/Download/rppf_step9b_extracted/css .
cp -r /sdcard/Download/rppf_step9b_extracted/js .
```

৪. গিট স্ট্যাটাস পরীক্ষা করুন:
```bash
git status
```

৫. ⚠️ **সঠিক ক্রম: Copy ➔ Add ➔ Commit ➔ Pull Rebase ➔ Push**:
*(কখনোই কমিটের আগে pull rebase চালাবেন না, কারণ আনকমিটেড ফাইল থাকলে গিট "You have unstaged changes" এরর দেয়)*:
```bash
# ক. শুধুমাত্র অনুমোদিত ফাইলগুলো যোগ করুন (কখনোই git add . বা git commit -a করবেন না)
git add index.html admin.html sw.js manifest.json DEPLOY.md css/ js/

# খ. লোকাল কমিট করুন
git commit -m "Test deploy modular files"

# গ. রিব্যাস করুন (লোকাল কমিটের পর রিব্যাস চালালে রিমোটের কোনো পরিবর্তন থাকলে তা সুন্দরভাবে নিচে গিয়ে লোকাল কমিট উপরে বসবে)
git pull --rebase origin main

# ঘ. পুশ করুন
git push origin main
```

#### 🔍 ফোনের ব্রাউজারে ইনকগনিটো মোডে টেস্ট সাইট (`https://checkot.github.io/checkot-test/`) খুলে ৮টি বিষয় যাচাই:

> ⚠️ **ইনকগনিটো / প্রাইভেট উইন্ডো ব্যবহার সংক্রান্ত সতর্কতা (Incognito Mode):**
> টেস্ট সাইট (`https://checkot.github.io/checkot-test/`) এবং মূল প্রোডাকশন সাইট (`https://checkot.github.io/`) একই ডোমেইনে (`checkot.github.io`) চলার কারণে সাধারণ ব্রাউজার ট্যাবে পুরনো ক্যাশ, সার্ভিস ওয়ার্কার বা কুকিজ মিশ্রিত হতে পারে। কোডে কি-নেমস্পেসিং (`checkot-test_...`) স্বয়ংক্রিয়ভাবে লোকালস্টোরেজ আলাদা রাখে, তবুও ক্যাশ ও সেশনের শতভাগ বিশুদ্ধতার জন্য **সবসময় ফোনের ব্রাউজারের "Incognito tab" বা "Private tab"-এ টেস্ট সাইটটি ওপেন করুন**।

১. **আইডি সার্চ**: সার্চ বক্সে পরিচিত আইডি `CF2979` লিখে সার্চ দিন এবং রিপোর্ট আসে কিনা দেখুন।
২. **হিসাবের সংখ্যা**: গ্র্যান্ড টোটাল (৳ ৮৭১৬.০০) এবং ওভারটাইম ঘণ্টা (১০২ ঘণ্টা) সঠিক দেখাচ্ছে কিনা মিলিয়ে নিন।
৩. **নিচের নেভিগেশন বার**: নিচের ৫টি ট্যাব (Home, VS, Report, Rank, More) চাপুন এবং পেজগুলো ঠিকমতো খোলে কিনা দেখুন।
৪. **ডার্ক মোড / লাইট মোড**: থিম টগল বাটনে চাপ দিয়ে ডার্ক মোডে লেখা পরিষ্কার পড়া যায় কিনা দেখুন।
৫. **ভাষা পরিবর্তন (বাংলা | EN)**: ভাষা পরিবর্তন বাটনে চাপ দিয়ে বাংলা ও ইংরেজি টেক্সট ঠিকমতো বদলায় কিনা দেখুন।
৬. **ভিএস (VS) তুলনা**: VS পেজে গিয়ে ২টি আইডি (`CF2979` এবং `RF8365`) দিয়ে তুলনা করুন এবং টেবিল আসে কিনা দেখুন।
৭. **লিডারবোর্ড ও ফিল্টার**: Leaderboard পেজে ঢুকে সেকশন ফিল্টার (Solid, Softgel, Packing) বদলে দেখুন তালিকা ফিল্টার হয় কিনা।
৮. **অ্যাডমিন প্যানেল ও সেফটি ব্যানার**: `admin.html` লিংকে ঢুকুন। পেজের শীর্ষে হলুদ সতর্কবার্তা ব্যারে ⚠️ **`TEST REPOSITORY ACTIVE: Connected to checkot/checkot-test`** লেখা দেখাচ্ছে কিনা নিশ্চিত করুন। টেস্ট সাইটের অ্যাডমিন প্যানেলে যেকোনো কিছু এডিট করা নিরাপদ, কারণ এটি শুধুমাত্র `checkot-test` রিপোজিটরিতে লিখবে এবং মূল প্রোডাকশনে কোনো পরিবর্তন হবে না।

---

### ধাপ ৭: মূল প্রোডাকশন রিপোজিটরিতে (`checkot/checkot.github.io`) চূড়ান্ত ডিপ্লয়

টেস্টে সবকিছু সফল হলে এবার মূল প্রোডাকশন সাইটে ডিপ্লয় করুন:

১. প্রোডাকশন রিপোজিটরিটি ফাস্ট ক্লোন করুন:
```bash
cd ~
rm -rf checkot.github.io
git clone --depth 1 https://github.com/checkot/checkot.github.io.git
cd checkot.github.io
```

২. অনুমোদিত ফাইল ও ফোল্ডারগুলো আলাদাভাবে কপি করুন:
*(⚠️ প্রোডাকশনে কোনো ডেটা ফাইল কপি করবেন না! প্রোডাকশনের ডেটা ফাইলগুলো সার্ভারের বট ও অ্যাডমিন প্যানেল দ্বারা পরিচালিত হয়)*:
```bash
cp /sdcard/Download/rppf_step9b_extracted/index.html .
cp /sdcard/Download/rppf_step9b_extracted/admin.html .
cp /sdcard/Download/rppf_step9b_extracted/sw.js .
cp /sdcard/Download/rppf_step9b_extracted/manifest.json .
cp /sdcard/Download/rppf_step9b_extracted/DEPLOY.md .
cp -r /sdcard/Download/rppf_step9b_extracted/css .
cp -r /sdcard/Download/rppf_step9b_extracted/js .
```

৩. **`git status`** দিয়ে নিশ্চিত হোন কোনো অবাঞ্ছিত ফাইল (`data/`, `tests/`, `screenshots/`) যুক্ত হয়নি:
```bash
git status
```

৪. ⚠️ **কখনোই `git add .` বা `git commit -a` করবেন না!** শুধুমাত্র অনুমোদিত ফাইলগুলো যোগ করে কমিট করুন:
```bash
git add index.html admin.html sw.js manifest.json DEPLOY.md css/ js/
git commit -m "Deploy production modular architecture"
```

৫. ⚠️ **কমিটের পর `git pull --rebase` চালান**:
*(যেহেতু প্রোডাকশনে স্বয়ংক্রিয় বট বা GitHub Actions প্রতিনিয়ত ডেটা আপডেট করতে পারে, তাই আপনার কমিটটি রিমোট বটের আপডেটের উপরে নিরাপদে বসানোর জন্য রিব্যাস করা আবশ্যক। কমিট করার পর রিব্যাস চালালে কোনো "unstaged changes" এরর আসবে না)*:
```bash
git pull --rebase origin main
```

৬. প্রোডাকশনে পুশ করুন:
```bash
git push origin main
```
*(পুশ সম্পন্ন হওয়ার ১-২ মিনিটের মধ্যে GitHub Pages সাইটটি নতুন মডিউলার আর্কিটেকচারে সম্পূর্ণ সচল হয়ে যাবে!)*

---

### ধাপ ৮: ডিপ্লয় পরবর্তী পরিচ্ছন্নতা ও নিরাপত্তা (Cleanup)
ডিপ্লয় শেষ হওয়ার পর আপনার ফোন থেকে সংরক্ষিত টোকেন মুছে ফেলুন:
```bash
rm -f ~/.git-credentials
git config --global --unset credential.helper
```
*(অতিরিক্ত নিরাপত্তার জন্য আপনি চাইলে GitHub Settings-এ গিয়ে তৈরি করা `phone-deploy` টোকেনটি ডিলিট করে দিতে পারেন।)*

> ⚠️ **টোকেন মুছে ফেলার পর রোলব্যাক বা নতুন পুশের সতর্কতা:**
> ধাপ ৮-এ টার্মিনাল থেকে টোকেন মুছে ফেলার পর, পরবর্তীতে যদি কখনো রোলব্যাক করতে হয় বা কোনো নতুন ফাইল পুশ করতে হয়, তবে টার্মিনাল পুনরায় গিটহাব ইউজারনেম ও টোকেন চাইবে। তখন আপনার সংরক্ষিত টোকেনটি আবার পেস্ট করতে হবে (অথবা মেয়াদ শেষ হয়ে থাকলে ধাপ ২ অনুযায়ী নতুন টোকেন তৈরি করে নিতে হবে)।

---

## পদ্ধতি ২ (বিকল্প ও পরীক্ষামূলক — EXPERIMENTAL): deploy.zip অটো-এক্সট্র্যাক্ট

আপনি যদি টার্মিনাল বা Termux ব্যবহার করতে একদমই না চান, তবে একটি একক জিপ আপলোড করার জন্য একটি কঠোর নিরাপত্তা সংবলিত অটোমেশন ওয়ার্কফ্লো (`.github/workflows/deploy-zip.yml`) তৈরি রাখা হয়েছে।

> **⚙️ ফুল-প্রজেক্ট ডিপ্লয় বৈশিষ্ট্য:**
> * এই ওয়ার্কফ্লোটি **শুধুমাত্র রিপোজিটরি ওনারের পুশ** গ্রহণ করে (`github.actor == github.repository_owner`)।
> * এতে `permissions: contents: write` কনফিগার করা রয়েছে যাতে অ্যাকশন থেকে নিরাপদ পুশ সম্পন্ন হতে পারে।
> * এটি ফুল-প্রজেক্ট আপডেট সমর্থন করে (`index.html`, `admin.html`, `css/`, `js/`, `data/`, `scripts/`, `areas.json` ইত্যাদি আপডেট হবে; শুধুমাত্র `.git` ও `raw/` অপরিবর্তিত থাকে)।
> * **স্মার্ট অটো-আনর‍্যাপ**: জিপ ফাইলে রুট ফোল্ডার (`checkot.github.io-main/`) থাকলেও অ্যাকশন তা স্বয়ংক্রিয়ভাবে শনাক্ত করে মূল রুট ডিরেক্টরিতে এক্সট্র্যাক্ট করে নেয়।
> * জিপটি প্রসেস করার পর স্বয়ংক্রিয়ভাবে `git rm -f deploy.zip` দিয়ে গিট থেকে মুছে ফেলে নতুন কমিট তৈরি করে।

**ব্যবহারের নিয়ম:**
১. প্রজেক্টের ফাইলগুলো দিয়ে তৈরি **`deploy.zip`** ফাইলটি নিন।
২. **অ্যাডমিন প্যানেল থেকে:** `admin.html`-এর **"📦 One-Click Site Code Update (Deploy ZIP)"** সেকশনে গিয়ে **"🚀 Select deploy.zip and Update Site"** চাপুন।
৩. **অথবা GitHub ওয়েবসাইট থেকে:** GitHub রিপোজিটরির পেজে গিয়ে **Add file** ➔ **Upload files**-এ চাপ দিয়ে `deploy.zip` আপলোড করে Commit দিন।
৪. GitHub Actions স্বয়ংক্রিয়ভাবে জিপটি এক্সট্র্যাক্ট করে সাইট লাইভ করে দেবে।

---

## রোলব্যাক নির্দেশিকা (ROLLBACK GUIDE — কোনো সমস্যা হলে আগের অবস্থায় ফেরত যাওয়ার উপায়)

যদি নতুন আপডেটে কোনো অনাকাঙ্ক্ষিত সমস্যা দেখা দেয়, তবে নিচের যেকোনো একটি সহজ উপায়ে সাথে সাথে পূর্বের ভার্সনে ফিরে যেতে পারবেন:

*(লক্ষ্য রাখবেন: ধাপ ৮-এ টোকেন মুছে ফেলা হয়ে থাকলে টার্মিনালে পুশ করার সময় আবার টোকেনটি পেস্ট করতে হবে)*

### উপায় ১: Termux-এ Git Revert (১ মিনিটে সমাধান)
Termux ওপেন করে প্রজেক্ট ফোল্ডারে ঢুকে শেষ পরিবর্তনটি বাতিল করুন:
```bash
cd ~/checkot.github.io
git revert HEAD --no-edit
git push origin main
```
*সাইট সাথে সাথে আগের অবস্থানে ফিরে যাবে।*

### উপায় ২: GitHub ওয়েবসাইট থেকে Revert
১. ফোনের ব্রাউজারে গিটহাব রিপোজিটরির পেজে গিয়ে **"Commits"** লিস্টে যান।
২. আপনার দেওয়া শেষ কমিটের ডানপাশে থ্রি-ডট (⋯) চিহ্নে চাপ দিয়ে **"Revert this commit"** চাপুন।
৩. **"Create pull request"** এবং **"Merge pull request"** চাপলেই সাইট আগের সফল অবস্থায় ফিরে যাবে।
