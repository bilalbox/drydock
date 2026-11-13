FROM node:24-bookworm-slim
WORKDIR /opt/drydock/inspector-gate
COPY package.json ./
COPY src ./src
ENV PORT=4502 \
    FLOCI_UI_ORIGIN=http://floci-ui:4500
EXPOSE 4502
CMD ["node", "src/main.js"]
