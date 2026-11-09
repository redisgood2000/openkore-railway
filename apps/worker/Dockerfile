FROM perl:5.38-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends git make gcc cpanminus libssl-dev zlib1g-dev libio-socket-ssl-perl libwww-perl libxml-writer-perl libxml-libxml-perl libjson-perl libdigest-sha-perl libcrypt-rijndael-perl libarchive-zip-perl libio-socket-inet6-perl libnet-ssleay-perl nodejs npm ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/OpenKore/openkore.git /opt/openkore
WORKDIR /opt/openkore
RUN cpanm --notest Algorithm::Diff Archive::Zip Compress::Zlib Crypt::Rijndael Digest::MD5 Digest::SHA File::ShareDir IO::Socket::INET6 IO::Socket::SSL JSON::PP List::MoreUtils Math::BigInt::GMP Scalar::Util Socket Test::Deep Time::HiRes URI XML::LibXML XML::Writer
WORKDIR /srv
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
RUN mkdir -p /data/control
ENV OPENKORE_DIR=/opt/openkore
CMD ["npm","start"]
