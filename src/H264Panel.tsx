import { CompressedImage } from "@foxglove/schemas/schemas/typescript";
import { PanelExtensionContext, RenderState, MessageEvent } from "@foxglove/studio";
import { useLayoutEffect, useEffect, useState, useCallback } from "react";
import ReactDOM from "react-dom";

import H264WebCodecVideo from "./H264WebCodecVideo";
import { useH264State } from "./Settings";

type ImageMessage = MessageEvent<CompressedImage>;

// 定义HeaderAndData类型接口
interface HeaderAndData {
  data_blocks: Array<{
    data: Uint8Array;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

type HeaderAndDataMessage = MessageEvent<HeaderAndData>;

function ExamplePanel({ context }: { context: PanelExtensionContext }): JSX.Element {
  const [renderDone, setRenderDone] = useState<(() => void) | undefined>();

  const { state, updatePanelSettingsEditor, imageTopics, setTopics } = useH264State(context);

  const [imageData, setImageData] = useState<Uint8Array | undefined>();

  useEffect(() => {
    // Save our state to the layout when the topic changes.
    context.saveState(state);

    if (state.data.topic) {
      // Subscribe to the new image topic when a new topic is chosen.
      context.subscribe([state.data.topic]);
    }

    updatePanelSettingsEditor(imageTopics);
  }, [context, state, imageTopics, updatePanelSettingsEditor]);

  const onRender = useCallback(
    (renderState: RenderState, done: () => void) => {
      setRenderDone(done);

      if (renderState.topics) {
        setTopics(renderState.topics);
      }

      // Send the frames to the muxer
      if (renderState.currentFrame && renderState.currentFrame.length > 0) {
        renderState.currentFrame.forEach((f) => {
          try {
            // 检查消息类型并提取相应的数据
            if (f.schemaName === "sensor_msgs/CompressedImage") {
              // 处理CompressedImage类型
              const imageMessage = f as ImageMessage;
              if (imageMessage.message && imageMessage.message.data instanceof Uint8Array) {
                setImageData(imageMessage.message.data);
              }
            } else if (f.schemaName === "mcapsdk.HeaderAndData") {
              // 处理HeaderAndData类型
              const headerAndDataMessage = f as HeaderAndDataMessage;
              if (
                headerAndDataMessage.message &&
                headerAndDataMessage.message.data_blocks &&
                headerAndDataMessage.message.data_blocks.length > 0 &&
                headerAndDataMessage.message.data_blocks[0].data instanceof Uint8Array
              ) {
                setImageData(headerAndDataMessage.message.data_blocks[0].data);
              }
            } else {
              // 尝试从其他类型的消息中找到可能的二进制数据
              const message = f.message as Record<string, unknown>;
              
              // 首先尝试直接访问data字段
              if (message.data instanceof Uint8Array) {
                setImageData(message.data);
                return;
              }
              
              // 然后尝试访问data_blocks[0].data字段
              if (
                message.data_blocks instanceof Array &&
                message.data_blocks.length > 0 &&
                typeof message.data_blocks[0] === "object" &&
                message.data_blocks[0] !== null &&
                (message.data_blocks[0] as Record<string, unknown>).data instanceof Uint8Array
              ) {
                setImageData((message.data_blocks[0] as Record<string, unknown>).data as Uint8Array);
                return;
              }
              
              // 最后尝试遍历所有字段查找Uint8Array类型的数据
              for (const key in message) {
                if (message[key] instanceof Uint8Array) {
                  setImageData(message[key] as Uint8Array);
                  break;
                }
              }
            }
          } catch (error) {
            console.warn("处理消息时出错:", error);
          }
        });
      }
    },
    [setTopics],
  );

  // Setup our onRender function and start watching topics and currentFrame for messages.
  useLayoutEffect(() => {
    context.onRender = onRender;

    context.watch("currentTime");
    context.watch("didSeek");
    context.watch("topics");
    context.watch("currentFrame");
  }, [context, onRender]);

  // Call our done function at the end of each render.
  useEffect(() => {
    renderDone?.();
  }, [renderDone]);

  return (
    <div style={{ height: "100%", padding: "1rem" }}>
      <H264WebCodecVideo frameData={imageData} renderDone={renderDone} />
    </div>
  );
}

export function initExamplePanel(context: PanelExtensionContext): void {
  ReactDOM.render(<ExamplePanel context={context} />, context.panelElement);
}
