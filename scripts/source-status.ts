import { platforms } from "../src/sources/platform-catalog.js";
console.table(platforms.map(({ id, mode, note }) => ({ source: id, mode, status: note })));
console.log(
  "Статусы описывают способ подключения; доступность сайта проверяется при запуске. ATS Greenhouse, Lever и SmartRecruiters также поддерживаются через существующие настройки.",
);
