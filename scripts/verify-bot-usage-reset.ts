import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { APP_SETTING_ID } from "../src/lib/appSettings";
import { checkAndConsumeBotQuestion } from "../src/lib/botSettings";

// Chequeo del reseteo mensual "perezoso" del tope de preguntas de Chontatec
// (sin cron): un período vencido debe resetear el contador en vez de seguir
// sumando sobre el valor viejo, y al llegar al tope debe dejar de sumar.
async function main() {
  const original = await prisma.appSetting.findUnique({ where: { id: APP_SETTING_ID } });

  try {
    // Período de hace 2 meses, con el contador ya alto — la siguiente
    // pregunta debe resetear a 1, no seguir sumando sobre 99.
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setUTCMonth(twoMonthsAgo.getUTCMonth() - 2);
    await prisma.appSetting.upsert({
      where: { id: APP_SETTING_ID },
      create: {
        id: APP_SETTING_ID,
        botUsagePeriodStart: twoMonthsAgo,
        botQuestionsUsedThisPeriod: 99,
        botMonthlyQuestionLimit: 5,
      },
      update: {
        botUsagePeriodStart: twoMonthsAgo,
        botQuestionsUsedThisPeriod: 99,
        botMonthlyQuestionLimit: 5,
      },
    });

    const afterReset = await checkAndConsumeBotQuestion();
    assert.ok(afterReset.ok, "Debía permitir la pregunta tras resetear el período vencido");
    if (afterReset.ok) {
      assert.equal(afterReset.remaining, 4, `Debía quedar 1 pregunta usada de 5 (remaining=4), dio remaining=${afterReset.remaining}`);
    }

    const settingAfterReset = await prisma.appSetting.findUniqueOrThrow({ where: { id: APP_SETTING_ID } });
    assert.equal(settingAfterReset.botQuestionsUsedThisPeriod, 1, "El contador debía quedar en 1 tras el reseteo, no seguir sumando sobre 99");

    // Agotar el resto del tope (quedan 4 disponibles) y confirmar que se
    // corta sin seguir incrementando.
    for (let i = 0; i < 4; i++) {
      const r = await checkAndConsumeBotQuestion();
      assert.ok(r.ok, `Pregunta ${i + 2}/5 debía permitirse`);
    }
    const atLimit = await checkAndConsumeBotQuestion();
    assert.equal(atLimit.ok, false, "Al llegar al tope, la siguiente pregunta debía rechazarse");

    const settingAtLimit = await prisma.appSetting.findUniqueOrThrow({ where: { id: APP_SETTING_ID } });
    assert.equal(settingAtLimit.botQuestionsUsedThisPeriod, 5, "El contador no debía seguir incrementando una vez alcanzado el tope");

    console.log("OK: reseteo mensual perezoso y corte en el tope de preguntas de Chontatec.");
  } finally {
    if (original) {
      await prisma.appSetting.update({ where: { id: APP_SETTING_ID }, data: original });
    } else {
      await prisma.appSetting.deleteMany({ where: { id: APP_SETTING_ID } });
    }
  }
}

main()
  .catch((err) => {
    console.error("FALLÓ:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
