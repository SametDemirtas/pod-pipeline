import type OpenAI from 'openai';
import {
  AiServiceBusyError,
  imageBase64,
  schemaInstruction,
  seesImages,
  type AiPart,
  type JsonAnswer,
  type JsonModel,
  type JsonQuestion,
} from '@pod/adapter-ai';
import { asVendor } from './errors.js';
import type { OpenAiVendor, VendorParams } from './vendors.js';

type ChatParams = OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;

/**
 * One model behind a Chat Completions API. Sampling settings are never sent:
 * reasoning models reject or ignore them.
 */
export class CompatibleJsonModel implements JsonModel {
  readonly service: string;
  readonly seesImages: boolean;

  constructor(
    private readonly client: OpenAI,
    private readonly vendor: OpenAiVendor,
    /** E.g. `gpt-6.1-sol`. */
    private readonly model: string,
  ) {
    this.service = vendor.service;
    this.seesImages = seesImages(vendor, model, vendor.othersSeeImages);
  }

  async ask(question: JsonQuestion): Promise<JsonAnswer> {
    const prompted = this.vendor.schema === 'prompted';
    const system = prompted
      ? `${question.system}\n\n${schemaInstruction(question.schema)}`
      : question.system;
    const body: ChatParams & VendorParams = {
      model: this.model,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: question.parts.map((part) => contentPart(part, this.vendor.highImageDetail)),
        },
      ],
      response_format: prompted
        ? { type: 'json_object' }
        : {
            type: 'json_schema',
            json_schema: { name: 'answer', strict: true, schema: question.schema },
          },
      ...this.vendor.params(question.effort),
    };
    const completion = await asVendor(this.vendor, () => this.client.chat.completions.create(body));
    const choice = completion.choices[0];
    // Not in the SDK's types: DeepSeek stops this way when it is short of servers.
    const finish: string | undefined = choice?.finish_reason;
    if (finish === 'insufficient_system_resource') {
      throw new AiServiceBusyError(this.service);
    }
    if (choice?.message.refusal || finish === 'content_filter') return { kind: 'refused' };
    if (finish === 'length') return { kind: 'cut-off' };
    return { kind: 'text', text: choice?.message.content || undefined };
  }
}

/** A message part, with images sent inline: some vendors cannot fetch image links. */
function contentPart(part: AiPart, highDetail?: true): OpenAI.Chat.ChatCompletionContentPart {
  if ('text' in part) return { type: 'text', text: part.text };
  const url = `data:${part.image.mimeType};base64,${imageBase64(part.image)}`;
  return { type: 'image_url', image_url: highDetail ? { url, detail: 'high' } : { url } };
}
